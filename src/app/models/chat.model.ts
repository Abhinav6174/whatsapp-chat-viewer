// src/app/models/chat.model.ts

// Represents a single parsed message from the .txt file
export interface Message {
  type: 'message';
  date: Date;
  author: string;
  content: string;
  isMedia: boolean;
}

// Represents a media message with a link to the media file
export interface MediaMessage extends Message {
  fileName: string;
  blobUrl: string; // We'll use a local Blob URL to display the media
}

// Represents the "TODAY" or "SEPTEMBER 21, 2023" separator
export interface DaySeparator {
  type: 'day-separator';
  date: Date;
  formattedDate: string;
}

// A union type for our final display list
export type DisplayItem = Message | MediaMessage | DaySeparator;