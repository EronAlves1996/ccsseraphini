import { Message, PartialMessage } from 'discord.js';
import { TweetV1, TwitterApi } from 'twitter-api-v2';
import fetch from 'node-fetch';
import { RETWEET_MEME_TIMEOUT } from './score';
import {
  addLogoToImage,
  addTextToImage,
  removeMemeCommands,
} from './image-scripts';
import { getAltText, getMessageContent } from './getMessageContent';
import { addLogoToVideo } from './image-scripts/addLogoToVideo';
import { removeMetadata } from './removeData';
import { addMetadata } from './addMetadata';

const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_KEY_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

export const ALLOWED_MEME_TYPES_TO_ADD_LOGO = [
  'image/jpg',
  'image/jpeg',
  'image/png',
];

export const ALLOWED_MEME_TYPES_TO_ADD_VIDEO_LOGO = [
  'video/mp4',
  'video/quicktime',
  'video/avi',
];

export const uploadMeme = async (
  message: Message | PartialMessage,
  alt?: string,
) => {
  const attachment = message.attachments.first();

  const image = await fetch(attachment.attachment.toString());

  let buffer = Buffer.from(await image.arrayBuffer());

  let newBuffer = buffer;

  const mimeType = attachment.contentType;

  /**
   * If the buffer is an image, we resize it then add logo.
   */
  if (ALLOWED_MEME_TYPES_TO_ADD_LOGO.includes(mimeType)) {
    const bufferWithText = await addTextToImage(message, buffer);
    newBuffer = await addLogoToImage(bufferWithText);
  }

  if (ALLOWED_MEME_TYPES_TO_ADD_VIDEO_LOGO.includes(mimeType)) {
    newBuffer = await addLogoToVideo(buffer, mimeType);
  }

  try {
    const media = await client.v1.uploadMedia(newBuffer, { mimeType });

    await addMetadata(client, { mediaId: media, mimeType, alt });

    return media;
  } catch (err) {
    console.error(err);
    return undefined;
  }
};

/**
 * Retweet the tweet after timeout.
 */
const scheduleRetweet = (tweet: TweetV1) => {
  setTimeout(async () => {
    try {
      await client.v1.post(`statuses/retweet/${tweet.id_str}.json`);
    } catch (err) {
      console.error(err);
    }
  }, RETWEET_MEME_TIMEOUT);
};

export const tweetMeme = async (message: Message | PartialMessage) => {
  const content = await getMessageContent(message);
  const altText = getAltText(content);

  const mediaId = await uploadMeme(message, altText);

  const mediaIds = mediaId ? [mediaId] : undefined;

  const contentCleaned = removeMetadata(content);
  const tweet = await client.v1.tweet(contentCleaned, {
    media_ids: mediaIds,
  });

  scheduleRetweet(tweet);

  const tweetUrl = `https://twitter.com/${tweet.user.screen_name}/status/${tweet.id_str}`;

  return { tweetUrl };
};
