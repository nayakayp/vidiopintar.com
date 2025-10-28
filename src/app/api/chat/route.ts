import { streamText } from 'ai';
import { googleAI, AI_MODELS } from '@/lib/ai/config';

import { fetchVideoTranscript, fetchVideoDetails } from '@/lib/youtube';
import { MessageRepository, VideoRepository, UserRepository } from '@/lib/db/repository';
import { createStreamTokenTracker } from '@/lib/token-tracker';
import { getCurrentUser } from '@/lib/auth';
import { getSystemPrompt } from '@/lib/ai/system-prompts';
import { UserPlanService } from '@/lib/user-plan-service';

export async function POST(req: Request) {
  try {
    const { messages, videoId, userVideoId, language } = await req.json();
    
    // Get user for token tracking - required for chat functionality
    const user = await getCurrentUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }), 
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Check if user can add videos (daily limit check)
    const canAddVideo = await UserPlanService.canAddVideo(user.id);
    if (!canAddVideo.canAdd) {
      return new Response(
        JSON.stringify({ 
          error: 'Daily limit reached',
          reason: canAddVideo.reason,
          videosUsedToday: canAddVideo.videosUsedToday,
          dailyLimit: canAddVideo.dailyLimit,
          currentPlan: canAddVideo.currentPlan
        }), 
        { 
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

  let transcriptText = '';
  let videoTitle = '';
  let videoDescription = '';

  if (videoId) {
    try {
      const transcriptResult = await fetchVideoTranscript(videoId);
      if (transcriptResult?.segments?.length > 0) {
        transcriptText = transcriptResult.segments.map((seg: any) => seg.text).join('\n');
      }

      let dbVideo = await VideoRepository.getByYoutubeId(videoId);

      if (dbVideo) {
        videoTitle = dbVideo.title || '';
        videoDescription = dbVideo.description || '';
      } else {
        const detailsResult = await fetchVideoDetails(videoId);
        if (detailsResult) {
          videoTitle = detailsResult.title;
          videoDescription = detailsResult.description;
        }
      }

    } catch (err) {
      console.error('Failed to fetch video data:', err);
    }
  }

  if (Array.isArray(messages)) {
    const lastUserMsg = [...messages].reverse().find(msg => msg.role === 'user');
    if (lastUserMsg) {
      try {
        await MessageRepository.create({
          userVideoId,
          content: lastUserMsg.content,
          role: 'user',
          timestamp: Math.floor(Date.now() / 1000),
        });
      } catch (err) {
        console.error('Failed to save user message:', err);
      }
    }
  }

  let enrichedMessages = messages;
  if (transcriptText || videoTitle) {
    const systemContent = getSystemPrompt(language || 'en', {
      videoTitle,
      videoDescription,
      transcriptText,
    });
    
    enrichedMessages = [
      {
        role: 'system',
        content: systemContent,
      },
      ...messages,
    ];
  }

    const tokenTracker = createStreamTokenTracker({
      userId: user.id,
      model: AI_MODELS.lite,
      provider: 'google',
      operation: 'chat',
      videoId,
      userVideoId,
    });

    const result = streamText({
      model: googleAI(AI_MODELS.lite),
      messages: enrichedMessages,
      onFinish: async (data) => {
        // Save assistant messages
        data.steps.forEach(async (item) => {
          try {
            await MessageRepository.create({
              userVideoId,
              content: item.text,
              role: 'assistant',
              timestamp: Math.floor(Date.now() / 1000),
            });
          } catch (err) {
            console.error('Failed to save assistant message:', err);
          }
        });
        
        // Track token usage
        await tokenTracker.onFinish(data);
      },
      onError: (error) => {
        console.error('Streaming error:', error);
      }
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('Chat API error:', error);
    
    return new Response(
      JSON.stringify({ error: 'Failed to process chat request' }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
