import { env } from "@/lib/env/server";
import { VideoRepository, TranscriptRepository, Video, UserRepository } from "@/lib/db/repository";
import { generateObject } from 'ai';
import { z } from 'zod';
import { generateSummary } from "@/lib/ai/summary";
import { getQuickStartPrompt } from "@/lib/ai/system-prompts";
import { formatTime } from "@/lib/utils";
import { trackGenerateTextUsage } from '@/lib/token-tracker';
import { googleAI, AI_MODELS } from '@/lib/ai/config';

import { UserVideoRepository } from "@/lib/db/repository";
import { getCurrentUser } from "./auth";
import { addSeconds, format } from "date-fns";

async function saveVideoUser(videoId: string, video: Video, segments: any[]) {
  const user = await getCurrentUser();
  
  // First create/get the user video to have the ID
  const userVideo = await UserVideoRepository.upsert({
    userId: user.id,
    youtubeId: videoId,
    summary: '', // Will be updated below
  });
  
  const summary = await generateUserVideoSummary(video, segments, userVideo.id);
  
  // Update with the generated summary
  return await UserVideoRepository.upsert({
    userId: user.id,
    youtubeId: videoId,
    summary: summary,
  });
}

export async function generateUserVideoSummary(video: Video, segments: any[], userVideoId?: number) {
  const transcriptText = segments.map((seg: {text: string}) => seg.text);
  const textToSummarize = `${video.title}\n${video.description ?? ""}\n${transcriptText}`;
  
  // Get user's language preference from database
  let userLanguage: 'en' | 'id' = 'en'; // Default to English
  try {
    const user = await getCurrentUser();
    const savedLanguage = await UserRepository.getPreferredLanguage(user.id);
    if (savedLanguage === 'en' || savedLanguage === 'id') {
      userLanguage = savedLanguage;
    }
  } catch (error) {
    console.log('Could not get user language preference, using default:', error);
  }
  
  const summary = await generateSummary(textToSummarize, userLanguage, video.youtubeId, userVideoId);

  return summary;
}

async function getVideoDetailFromApi(videoId: string) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
  const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`, {
    headers: {
      'Accept': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch video details: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  // Convert oEmbed response to match expected format
  return {
    title: data.title,
    description: '', // oEmbed doesn't provide description
    channelTitle: data.author_name,
    publishedAt: null, // oEmbed doesn't provide publish date
    thumbnails: {
      default: {
        url: data.thumbnail_url,
        width: data.thumbnail_width,
        height: data.thumbnail_height,
      },
      medium: {
        url: data.thumbnail_url,
        width: data.thumbnail_width,
        height: data.thumbnail_height,
      },
      high: {
        url: data.thumbnail_url,
        width: data.thumbnail_width,
        height: data.thumbnail_height,
      },
      maxres: {
        url: data.thumbnail_url,
        width: data.thumbnail_width,
        height: data.thumbnail_height,
      },
      standard: {
        url: data.thumbnail_url,
        width: data.thumbnail_width,
        height: data.thumbnail_height,
      }
    }
  }
}

export async function fetchVideoDetails(videoId: string) {
  try {
    const user = await getCurrentUser();
    let existingVideo = await VideoRepository.getByYoutubeId(videoId);
    const userVideo = await UserVideoRepository.getByUserAndYoutubeId(user.id, videoId);
    
    if (existingVideo) {
      if (existingVideo.channelTitle === "Unknown Channel") {
        const videoDetails = await getVideoDetailFromApi(videoId);
        existingVideo = await VideoRepository.upsert({
          youtubeId: videoId,
          title: videoDetails.title,
          description: videoDetails.description,
          channelTitle: videoDetails.channelTitle,
          publishedAt: videoDetails.publishedAt ? new Date(videoDetails.publishedAt) : null,
          thumbnailUrl:
            videoDetails.thumbnails?.high?.url ||
            videoDetails.thumbnails?.medium?.url ||
            videoDetails.thumbnails?.default?.url ||
            null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      return {
        title: existingVideo.title,
        description: existingVideo.description || "",
        channelTitle: existingVideo.channelTitle || "",
        publishedAt: existingVideo.publishedAt?.toISOString(),
        thumbnails: { high: { url: existingVideo.thumbnailUrl || "" } },
        tags: [],
        userVideo,
        video: existingVideo,
      };
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch video details: ${response.status} ${response.statusText}`);
    }

    const oembedData = await response.json();

    // Convert oEmbed response to match expected format
    const data = {
      title: oembedData.title,
      description: '', // oEmbed doesn't provide description
      channelTitle: oembedData.author_name,
      publishedAt: null, // oEmbed doesn't provide publish date
      thumbnails: {
        default: {
          url: oembedData.thumbnail_url,
          width: oembedData.thumbnail_width,
          height: oembedData.thumbnail_height,
        },
        medium: {
          url: oembedData.thumbnail_url,
          width: oembedData.thumbnail_width,
          height: oembedData.thumbnail_height,
        },
        high: {
          url: oembedData.thumbnail_url,
          width: oembedData.thumbnail_width,
          height: oembedData.thumbnail_height,
        },
        maxres: {
          url: oembedData.thumbnail_url,
          width: oembedData.thumbnail_width,
          height: oembedData.thumbnail_height,
        },
        standard: {
          url: oembedData.thumbnail_url,
          width: oembedData.thumbnail_width,
          height: oembedData.thumbnail_height,
        }
      },
      tags: [], // oEmbed doesn't provide tags
    };

    await VideoRepository.upsert({
      youtubeId: videoId,
      title: data.title,
      description: data.description,
      channelTitle: data.channelTitle,
      publishedAt: data.publishedAt ? new Date(data.publishedAt) : null,
      // Prefer highest-resolution thumbnail available
      thumbnailUrl:
        data.thumbnails?.maxres?.url ||
        data.thumbnails?.standard?.url ||
        data.thumbnails?.high?.url ||
        data.thumbnails?.medium?.url ||
        data.thumbnails?.default?.url ||
        '',
    });
    
    return {
      title: data.title,
      description: data.description,
      channelTitle: data.channelTitle,
      publishedAt: data.publishedAt,
      thumbnails: data.thumbnails,
      tags: data.tags,
      userVideo,
    };
  } catch (error) {
    console.error('Error fetching video details:', error);
    
    // Fallback to basic info in case of error
    return {
      title: `Video ${videoId}`,
      description: "Unable to load video description.",
      channelTitle: "Unknown Channel",
      publishedAt: new Date().toISOString(),
      thumbnails: {},
      tags: [],
      userVideo: null,
    };
  }
}

export async function fetchVideoTranscript(videoId: string) {
  try {
    const user = await getCurrentUser();
    const dbSegments = await TranscriptRepository.getByVideoId(videoId);
    if (dbSegments.length > 0) {
      const segments = dbSegments
        .map((item: any) => ({
          start: item.start,
          end: item.end,
          text: item.text,
          isChapterStart: item.isChapterStart,
        }))
        .sort((a, b) => a.start - b.start);
      let userVideo = await UserVideoRepository.getByUserAndYoutubeId(user.id, videoId);
      if (!userVideo) {
        const video = await VideoRepository.getByYoutubeId(videoId);
        userVideo = await saveVideoUser(videoId, video!, segments);
      }
      return { segments, userVideo };
    }

    // No transcript found in database, fetch from API
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`

    // Use TranscriptAPI.com if available, otherwise fall back to original API
    const useTranscriptApi = env.TRANSCRIPT_API_BASE_URL && env.TRANSCRIPT_API_KEY;

    let response;
    let data;

    if (useTranscriptApi) {
      // Use TranscriptAPI.com
      response = await fetch(`${env.TRANSCRIPT_API_BASE_URL}/api/v2/youtube/transcript?video_url=${videoId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${env.TRANSCRIPT_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        // Handle specific TranscriptAPI.com errors
        if (response.status === 401) {
          throw new Error('Invalid TranscriptAPI.com API key');
        } else if (response.status === 402) {
          throw new Error('No TranscriptAPI.com credits remaining');
        } else if (response.status === 429) {
          throw new Error('TranscriptAPI.com rate limit exceeded');
        } else {
          throw new Error(`Failed to fetch transcript from TranscriptAPI.com: ${response.status} ${response.statusText}`);
        }
      }

      data = await response.json();
    } else {
      // Fall back to original API
      const encodedUrl = encodeURIComponent(videoUrl);
      response = await fetch(`${env.API_BASE_URL}/youtube/transcript?videoUrl=${encodedUrl}`, {
        headers: {
          'X-API-Key': env.API_X_HEADER_API_KEY,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch transcript: ${response.status} ${response.statusText}`);
      }

      data = await response.json();
    }
    
    // Handle different response formats based on API used
    let segments;

    if (useTranscriptApi) {
      // TranscriptAPI.com format: { transcript: [{ text, start, duration }] }
      segments = data.transcript.map((item: any, index: number) => {
        const start = item.start; // Already in seconds
        const end = item.start + item.duration; // Calculate end time

        const baseDate = new Date(0);
        baseDate.setHours(0, 0, 0, 0);

        const startTime = addSeconds(baseDate, start);
        const endTime = addSeconds(baseDate, end);

        // Check if this might be a chapter start (simple heuristic)
        const isChapterStart = item.text.length < 30 &&
                              !item.text.includes('segment') &&
                              item.text !== 'N/A' &&
                              (index === 0 || index % 10 === 0); // Just a heuristic

        return {
          start: format(startTime, 'HH:mm:ss'),
          end: format(endTime, 'HH:mm:ss'),
          text: item.text || `Segment at ${formatTime(start)}`,
          isChapterStart,
        };
      });
    } else {
      // Original API format: { content: [{ text, start, end }] }
      segments = data.content.map((item: any, index: number) => {
        // Convert start and end times from strings to numbers
        const start = parseInt(item.start, 10) / 1000; // Convert milliseconds to seconds if needed
        const end = parseInt(item.end, 10) / 1000; // Convert milliseconds to seconds if needed

        const baseDate = new Date(0);
        baseDate.setHours(0, 0, 0, 0);

        const startTime = addSeconds(baseDate, Number(start));
        const endTime = addSeconds(baseDate, Number(end));

        // Check if this might be a chapter start (simple heuristic)
        const isChapterStart = item.text.length < 30 &&
                              !item.text.includes('segment') &&
                              item.text !== 'N/A' &&
                              (index === 0 || index % 10 === 0); // Just a heuristic

        return {
          start: format(startTime, 'HH:mm:ss'),
          end: format(endTime, 'HH:mm:ss'),
          text: item.text !== 'N/A' ? item.text : `Segment at ${formatTime(start)}`,
          isChapterStart,
        };
      });
    }

    await TranscriptRepository.upsertSegments(videoId, segments);

    // Generate and update summary for the video
    // Only generate summary if none exists
    const video = await VideoRepository.getByYoutubeId(videoId);
    let userVideo = await UserVideoRepository.getByUserAndYoutubeId(user.id, videoId);
    if (video) {
      if (!userVideo) {
        userVideo = await saveVideoUser(videoId, video, segments);
      } else {
        // Generate summary if it doesn't exist
        if (!userVideo.summary) {
          const summary = await generateUserVideoSummary(video, segments, userVideo.id);
          userVideo = await UserVideoRepository.upsert({
            userId: user.id,
            youtubeId: videoId,
            summary: summary,
          });
        }
      }
      await VideoRepository.upsert({
        youtubeId: videoId,
        title: video.title,
        description: video.description,
        channelTitle: video.channelTitle,
        publishedAt: video.publishedAt,
        thumbnailUrl: video.thumbnailUrl,
      });
    }
    return {
      segments,
      userVideo
    }
  } catch (error) {
    console.error('Error fetching transcript:', error)
    return {
      segments: [],
      error: true,
      errorMessage: "Transcript not available for this video"
    }
  }
}

export async function generateQuickStartQuestions(summary: string, userVideoId?: number, videoId?: string) {
  // Get user's language preference from database
  let userLanguage: 'en' | 'id' = 'en'; // Default to English
  try {
    const user = await getCurrentUser();
    const savedLanguage = await UserRepository.getPreferredLanguage(user.id);
    if (savedLanguage === 'en' || savedLanguage === 'id') {
      userLanguage = savedLanguage;
    }
  } catch (error) {
    console.log('Could not get user language preference for quick start questions, using default:', error);
  }

  const promptText = getQuickStartPrompt(userLanguage);
  const prompt = `${promptText}

Here is the transcript summary:

<summary>
${summary}
</summary>
`;

  const startTime = Date.now();
  const result = await generateObject({
    model: googleAI(AI_MODELS.lite),
    prompt: prompt,
    schema: z.object({
      questions: z.array(z.string()),
    }),
  });
  
  // Track token usage
  try {
    const user = await getCurrentUser();
    await trackGenerateTextUsage(result, {
      userId: user.id,
      model: AI_MODELS.lite,
      provider: 'google',
      operation: 'quick_start_questions',
      videoId,
      userVideoId,
      requestDuration: Date.now() - startTime,
    });
  } catch (error) {
    console.error('Failed to track quick start questions token usage:', error);
  }
  
  const questions = result.object?.questions || [];
  
  // Save to database if userVideoId is provided
  if (userVideoId && questions.length > 0) {
    await UserVideoRepository.updateQuickStartQuestions(userVideoId, questions);
  }
  
  return questions;
}
