import { Component } from '@angular/core';
import JSZip from 'jszip';
import { format, isToday, isYesterday } from 'date-fns';
import { DisplayItem, Message, MediaMessage, DaySeparator } from '../models/chat.model';
import { CommonModule } from '@angular/common';
import { FormsModule as formsModule } from '@angular/forms';

interface ChatMessage {
  timestamp: string;
  sender: string;
  message: string;
  media?: string;
  mediaType?: string;
  date: string;
}

@Component({
  selector: 'app-chat-viewer',
  templateUrl: './chat-viewer.component.html',
  styleUrls: ['./chat-viewer.component.css'],
  standalone: true,
  imports: [formsModule, CommonModule],
})

export class ChatViewerComponent {
  messages: ChatMessage[] = [];
  mediaFiles: { [key: string]: string } = {};
  primaryUser: string = '';
  availableUsers: string[] = [];

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    const zip = new JSZip();
    const zipData = await zip.loadAsync(file);

    // Extract media files
    for (const [fileName, fileData] of Object.entries(zipData.files)) {
      if (!fileData.dir) {
        const blob = await fileData.async('blob');
        this.mediaFiles[fileName] = URL.createObjectURL(blob);
      }
    }

    // Process chat text file
    const chatFile = Object.keys(zipData.files).find(f => f.endsWith('.txt'));
    if (chatFile) {
      const text = await zipData.file(chatFile)?.async('text');
      if (text) {
        this.parseChatText(text);
      }
    }
  }

  onPrimaryUserChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.primaryUser = select.value;
  }

  isPrimaryUser(sender: string): boolean {
    return sender === this.primaryUser;
  }

  parseChatText(text: string) {
    const lines = text.split('\n');
    const messages: ChatMessage[] = [];
    const users = new Set<string>();
    
    // Updated regex to handle various message formats
    const messageRegex = /^(\d{1,2}\/\d{1,2}\/\d{2,4}, \d{1,2}:\d{2}\s?(?:am|pm)?)\s?-\s?([^:]*):\s?(.+)$/i;
    const systemMessageRegex = /^(\d{1,2}\/\d{1,2}\/\d{2,4}, \d{1,2}:\d{2}\s?(?:am|pm)?)\s?-\s?(.+)$/i;

    let currentMessage: Partial<ChatMessage> | null = null;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Try to match regular message format
      let match = trimmedLine.match(messageRegex);
      let isSystemMessage = false;

      // If no match, try system message format
      if (!match) {
        match = trimmedLine.match(systemMessageRegex);
        isSystemMessage = match ? true : false;
      }

      if (match) {
        const [, timestamp, sender, message] = match;
        const date = new Date(timestamp).toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
        });

        // Handle different message types
        let media: string | undefined;
        let mediaType: string | undefined;
        let processedMessage = message || sender; // For system messages, message is in sender position

        if (isSystemMessage) {
          // System message - no sender, message is in the sender position
          currentMessage = {
            timestamp: new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
            sender: 'System',
            message: processedMessage,
            date
          };
        } else {
          // Regular message
          const actualSender = sender.trim();
          const actualMessage = message.trim();

          // Add user to the set if not empty
          if (actualSender && actualSender !== 'Unknown') {
            users.add(actualSender);
          }

          // Handle media messages
          if (actualMessage.includes('<Media omitted>')) {
            const mediaFileName = Object.keys(this.mediaFiles).find(f => f.includes(messages.length.toString()));
            if (mediaFileName) {
              media = this.mediaFiles[mediaFileName];
              mediaType = this.getMediaType(mediaFileName);
            }
            processedMessage = actualMessage.replace('<Media omitted>', '').trim();
          }

          // Handle file attachment messages
          if (actualMessage.includes('(file attached)')) {
            const fileName = actualMessage.replace('(file attached)', '').trim();
            mediaType = this.getMediaType(fileName);
            processedMessage = `📎 ${fileName}`;
          }

          currentMessage = {
            timestamp: new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
            sender: actualSender || 'Unknown',
            message: processedMessage,
            media,
            mediaType,
            date
          };
        }

        messages.push(currentMessage as ChatMessage);
      } else if (currentMessage && trimmedLine) {
        // Multi-line message continuation
        currentMessage.message += '\n' + trimmedLine;
      }
    }

    this.messages = messages;
    
    // Set available users and default primary user
    this.availableUsers = Array.from(users).sort();
    if (this.availableUsers.length > 0 && !this.primaryUser) {
      this.primaryUser = this.availableUsers[0];
    }
  }

  getMediaType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
        return 'image/' + ext;
      case 'mp4':
      case 'mov':
      case 'avi':
      case 'mkv':
        return 'video/' + ext;
      case 'pdf':
        return 'application/pdf';
      case 'doc':
      case 'docx':
        return 'application/msword';
      case 'opus':
        return 'audio/opus';
      case 'mp3':
      case 'wav':
      case 'm4a':
        return 'audio/' + ext;
      case 'txt':
        return 'text/plain';
      default:
        return 'application/octet-stream';
    }
  }
}