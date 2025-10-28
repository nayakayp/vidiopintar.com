import { NextRequest, NextResponse } from "next/server";
import { generateObject } from 'ai';
import { z } from 'zod';
import { getCurrentUser } from "@/lib/auth";
import { trackGenerateTextUsage } from '@/lib/token-tracker';
import { extractVideoId } from "@/lib/utils";
import { env } from "@/lib/env/server";
import { googleAI, AI_MODELS } from '@/lib/ai/config';

const systemPrompt = `
You are an expert Twitter content strategist and copywriter specializing in viral thread creation. You understand Twitter's algorithm, audience psychology, and what makes content shareable. Your expertise includes crafting compelling hooks, structuring information for maximum engagement, and optimizing content for Twitter's unique format and character constraints.

**Twitter Thread Creator**

I'll help you create compelling Twitter threads that drive engagement. Here's my process:

**Step 1: Outline Creation**
When you provide a topic, I'll create a strategic outline featuring:
- **Hook**: Attention-grabbing opener
- **Pain Point**: Problem your audience faces
- **Promise**: Clear value proposition
- **Structure**: 3-5 key points that deliver on the promise

**Step 2: Thread Creation** (after your approval)
I'll write a complete thread with:
- **Opening tweet**: Hook + Pain Point + Promise + thread count (🧵 1/X)
- **Body tweets**: Numbered posts (2/X, 3/X, etc.) with focused, actionable content
- **Formatting**: Optimized for Twitter's character limits with proper spacing and readability

**Formatting Examples:**

*Opening Tweet:*

Most people think productivity is about doing more.

But high performers know the real secret is doing LESS of the right things.

Here's the 80/20 framework that changed everything for me:

🧵 1/6

*Body Tweet:*

2/6

The 80/20 Rule in action:

• 20% of your tasks = 80% of your results
• 20% of your clients = 80% of your revenue  
• 20% of your habits = 80% of your happiness

Focus on identifying your high-impact 20%.


**Content Standards:**
- Each tweet stands alone while building toward the overall message
- Clear, conversational tone
- Actionable insights over fluff
- Strategic use of emojis and formatting for visual appeal
- Proper line breaks and bullet points for readability
- Each threads can be 500 characters

`;

const threadSchema = z.object({
  outline: z.object({
    hook: z.string().describe("Attention-grabbing opener"),
    painPoint: z.string().describe("Problem the audience faces"),
    promise: z.string().describe("Clear value proposition"),
    keyPoints: z.array(z.string()).describe("3-5 key points that deliver on the promise")
  }),
  threads: z.array(z.object({
    tweetNumber: z.number(),
    content: z.string(),
    isOpening: z.boolean()
  })).describe("Complete Twitter thread with proper formatting")
});

async function fetchTranscriptOnly(videoId: string) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const encodedUrl = encodeURIComponent(videoUrl);
  const response = await fetch(`${env.API_BASE_URL}/youtube/transcript?videoUrl=${encodedUrl}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch transcript: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  if (!data.content || data.content.length === 0) {
    throw new Error("No transcript available for this video");
  }
  
  return data.content.map((item: any) => ({
    text: item.text !== 'N/A' ? item.text : '',
    start: item.start,
    end: item.end
  }));
}

async function fetchVideoDetailsOnly(videoId: string) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const encodedUrl = encodeURIComponent(videoUrl);
  const response = await fetch(`${env.API_BASE_URL}/youtube/video?videoUrl=${encodedUrl}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch video details: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  return {
    title: data.title,
    channelTitle: data.channelTitle,
    thumbnailUrl: data.thumbnails?.maxres?.url || 
                  data.thumbnails?.standard?.url || 
                  data.thumbnails?.high?.url || 
                  data.thumbnails?.medium?.url || 
                  data.thumbnails?.default?.url || 
                  null,
    publishedAt: data.publishedAt
  };
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const { youtubeUrl, language = "en" } = await request.json();
    
    if (!youtubeUrl) {
      return NextResponse.json({ error: "YouTube URL is required" }, { status: 400 });
    }
    
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
    }
    
    // Fetch video details for thumbnail and metadata
    let videoDetails;
    try {
      videoDetails = await fetchVideoDetailsOnly(videoId);
    } catch (error) {
      console.error('Error fetching video details:', error);
      return NextResponse.json({ 
        error: "Failed to fetch video details. Please try again or use a different video." 
      }, { status: 400 });
    }
    
    // Fetch transcript
    let transcriptSegments;
    try {
      transcriptSegments = await fetchTranscriptOnly(videoId);
    } catch (error) {
      console.error('Error fetching transcript:', error);
      return NextResponse.json({ 
        error: "Failed to fetch transcript. This might be due to the video not having captions, being private, or the YouTube API being temporarily unavailable. Please try again or use a different video." 
      }, { status: 400 });
    }
    
    // Combine transcript text
    const transcriptText = transcriptSegments.map((seg: any) => seg.text).join(' ');
    
    // Limit text to prevent excessive token usage
    const MAX_WORDS = 5000;
    const words = transcriptText.split(/\s+/);
    const truncatedText = words.length > MAX_WORDS ? words.slice(0, MAX_WORDS).join(' ') : transcriptText;
    
    const languageInstruction = language === "id" 
      ? "Create the Twitter thread in Indonesian language." 
      : "Create the Twitter thread in English language.";

    const prompt = `Based on this video transcript, create a compelling Twitter thread that captures the key insights and makes them engaging for a Twitter audience.

${languageInstruction}

Transcript:
${truncatedText}

NOTE:
- DO NOT use hashtag
`;
    
    const startTime = Date.now();

    const result = await generateObject({
      model: googleAI(AI_MODELS.pro),
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      schema: threadSchema,
    });
    
    // Track token usage
    try {
      await trackGenerateTextUsage(result, {
        userId: user.id,
        model: AI_MODELS.pro,
        provider: 'google',
        operation: 'thread_generator',
        videoId,
        requestDuration: Date.now() - startTime,
      });
    } catch (error) {
      console.error('Failed to track thread generation token usage:', error);
    }
    
    return NextResponse.json({
      success: true,
      data: result.object,
      videoDetails: videoDetails
    });
    
  } catch (error) {
    console.error('Error generating thread:', error);
    return NextResponse.json({ error: "Failed to generate thread" }, { status: 500 });
  }
}