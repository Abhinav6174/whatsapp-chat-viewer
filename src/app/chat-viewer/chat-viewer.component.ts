import { Component, OnDestroy } from '@angular/core';
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
  mediaData?: ArrayBuffer;
  date: string;
}

@Component({
  selector: 'app-chat-viewer',
  templateUrl: './chat-viewer.component.html',
  styleUrls: ['./chat-viewer.component.css'],
  standalone: true,
  imports: [formsModule, CommonModule],
})

export class ChatViewerComponent implements OnDestroy {
  messages: ChatMessage[] = [];
  mediaFiles: { [key: string]: string } = {};
  mediaFileTypes: { [key: string]: string } = {};
  mediaFileData: { [key: string]: ArrayBuffer } = {};
  primaryUser: string = '';
  availableUsers: string[] = [];

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    const zip = new JSZip();
    const zipData = await zip.loadAsync(file);

    // Extract media files and store them with better indexing
    this.mediaFiles = {};
    this.mediaFileTypes = {};
    this.mediaFileData = {};
    const mediaFileNames = Object.keys(zipData.files).filter(f => !f.endsWith('.txt') && !zipData.files[f].dir);
    
    for (const fileName of mediaFileNames) {
      const fileData = zipData.files[fileName];
      const blob = await fileData.async('blob');
      
      // Detect actual file type from metadata
      const detectedType = await this.detectFileType(blob);
      this.mediaFileTypes[fileName] = detectedType;
      
      // For PDF files, store the data directly instead of creating blob URL
      if (detectedType === 'application/pdf') {
        const arrayBuffer = await fileData.async('arraybuffer');
        this.mediaFileData[fileName] = arrayBuffer;
      } else {
        // For other files, create blob URL as before
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

  private async detectFileType(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Check file signatures (magic numbers)
        if (this.isPNG(uint8Array)) {
          resolve('image/png');
        } else if (this.isJPEG(uint8Array)) {
          resolve('image/jpeg');
        } else if (this.isGIF(uint8Array)) {
          resolve('image/gif');
        } else if (this.isWebP(uint8Array)) {
          resolve('image/webp');
        } else if (this.isPDF(uint8Array)) {
          resolve('application/pdf');
        } else if (this.isMP4(uint8Array)) {
          resolve('video/mp4');
        } else if (this.isMP3(uint8Array)) {
          resolve('audio/mpeg');
        } else if (this.isOPUS(uint8Array)) {
          resolve('audio/opus');
        } else {
          // Fallback to blob type or default
          resolve(blob.type || 'application/octet-stream');
        }
      };
      reader.readAsArrayBuffer(blob);
    });
  }

  private isPNG(bytes: Uint8Array): boolean {
    return bytes.length >= 8 && 
           bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
           bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A;
  }

  private isJPEG(bytes: Uint8Array): boolean {
    return bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xD8;
  }

  private isGIF(bytes: Uint8Array): boolean {
    return bytes.length >= 6 && 
           bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
           bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61;
  }

  private isWebP(bytes: Uint8Array): boolean {
    return bytes.length >= 12 && 
           bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
           bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }

  private isPDF(bytes: Uint8Array): boolean {
    return bytes.length >= 4 && 
           bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  }

  private isMP4(bytes: Uint8Array): boolean {
    return bytes.length >= 8 && 
           ((bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) ||
            (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x00 && bytes[3] === 0x18));
  }

  private isMP3(bytes: Uint8Array): boolean {
    return bytes.length >= 3 && 
           ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
            (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0));
  }

  private isOPUS(bytes: Uint8Array): boolean {
    // OPUS files typically start with "OggS" (Ogg container)
    return bytes.length >= 4 && 
           bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53;
  }

  onPrimaryUserChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.primaryUser = select.value;
  }

  isPrimaryUser(sender: string): boolean {
    return sender === this.primaryUser;
  }

  private formatDateForDisplay(date: Date): string {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Reset time to compare only dates
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const yesterdayDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    if (messageDate.getTime() === todayDate.getTime()) {
      return 'Today';
    } else if (messageDate.getTime() === yesterdayDate.getTime()) {
      return 'Yesterday';
    } else {
      // For other dates, show the full date
      return date.toLocaleDateString('en-US', {
        weekday: 'long', 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric'
      });
    }
  }

  parseChatText(text: string) {
    const lines = text.split('\n');
    const messages: ChatMessage[] = [];
    const users = new Set<string>();
    
    // Updated regex to handle various message formats with better date parsing
    const messageRegex = /^(\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}\s*(?:am|pm)?)\s*-\s*([^:]*):\s*(.+)$/i;
    const systemMessageRegex = /^(\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}\s*(?:am|pm)?)\s*-\s*(.+)$/i;

    let currentMessage: Partial<ChatMessage> | null = null;
    let messageIndex = 0;

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
        
        // Better date parsing
        let date: Date;
        try {
          // Handle different date formats
          let dateStr = timestamp.replace(/,/g, '').trim();
          
          // Parse the date parts
          const dateTimeMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
          
          if (dateTimeMatch) {
            const [, day, month, year, hour, minute, ampm] = dateTimeMatch;
            
            // Convert 2-digit year to 4-digit year
            let fullYear = parseInt(year);
            if (fullYear < 100) {
              // Assume years 00-29 are 2000-2029, years 30-99 are 1930-1999
              fullYear = fullYear <= 29 ? 2000 + fullYear : 1900 + fullYear;
            }
            
            // Convert month to 0-based index
            const monthIndex = parseInt(month) - 1;
            
            // Parse hour and handle AM/PM
            let hour24 = parseInt(hour);
            if (ampm) {
              if (ampm.toLowerCase() === 'pm' && hour24 !== 12) {
                hour24 += 12;
              } else if (ampm.toLowerCase() === 'am' && hour24 === 12) {
                hour24 = 0;
              }
            }
            
            date = new Date(fullYear, monthIndex, parseInt(day), hour24, parseInt(minute));
          } else {
            // Fallback to original parsing
            date = new Date(dateStr);
          }
          
          // Validate the date
          if (isNaN(date.getTime())) {
            date = new Date();
          }
        } catch (error) {
          date = new Date();
        }

        // Format date with relative dates
        const formattedDate = this.formatDateForDisplay(date);

        // Handle different message types
        let media: string | undefined;
        let mediaType: string | undefined;
        let mediaData: ArrayBuffer | undefined;
        let processedMessage = message || sender; // For system messages, message is in sender position

        if (isSystemMessage) {
          // System message - no sender, message is in the sender position
          currentMessage = {
            timestamp: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
            sender: 'System',
            message: processedMessage,
            date: formattedDate
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
            // For <Media omitted> messages, just show the text without trying to associate media files
            processedMessage = '📎 Media omitted';
          }

          // Handle file attachment messages
          if (actualMessage.includes('(file attached)')) {
            const fileName = actualMessage.replace('(file attached)', '').trim();
            
            // Check if it's a WebP file (sticker)
            if (fileName.toLowerCase().includes('.webp')) {
              processedMessage = `😀 ${fileName.replace('.webp', '').replace('(file attached)', '').trim()}`;
            } else {
              processedMessage = `📎 ${fileName}`;
            }
            
            // Try to find the actual file in mediaFiles or mediaFileData
            const allFileNames = [...Object.keys(this.mediaFiles), ...Object.keys(this.mediaFileData)];
            const mediaFileName = allFileNames.find(f => {
              const fLower = f.toLowerCase();
              const fileNameLower = fileName.toLowerCase();
              
              // Direct match
              if (fLower === fileNameLower) return true;
              
              // Contains match
              if (fLower.includes(fileNameLower) || fileNameLower.includes(fLower)) return true;
              
              // For OPUS files, also check if the filename contains the pattern
              if (fileNameLower.includes('.opus') || fLower.includes('.opus')) {
                // Extract the base name without extension for better matching
                const baseName = fileNameLower.replace('.opus', '').replace('(file attached)', '').trim();
                const fileBaseName = fLower.replace('.opus', '');
                if (fileBaseName.includes(baseName) || baseName.includes(fileBaseName)) return true;
              }
              
              // For WebP files (stickers), also check if the filename contains the pattern
              if (fileNameLower.includes('.webp') || fLower.includes('.webp')) {
                // Extract the base name without extension for better matching
                const baseName = fileNameLower.replace('.webp', '').replace('(file attached)', '').trim();
                const fileBaseName = fLower.replace('.webp', '');
                if (fileBaseName.includes(baseName) || baseName.includes(fileBaseName)) return true;
              }
              
              return false;
            });
            
            if (mediaFileName) {
              // Use detected file type from metadata if available, but prioritize filename-based detection for OPUS
              const detectedType = this.mediaFileTypes[mediaFileName];
              if (detectedType && detectedType !== 'application/octet-stream') {
                mediaType = detectedType;
              } else {
                mediaType = this.getMediaType(mediaFileName);
              }
              
              // Handle PDF files differently
              if (mediaType === 'application/pdf') {
                // For PDF files, store the data directly
                if (this.mediaFileData[mediaFileName]) {
                  mediaData = this.mediaFileData[mediaFileName];
                }
              } else {
                // For other files, use the blob URL
                if (this.mediaFiles[mediaFileName]) {
                  media = this.mediaFiles[mediaFileName];
                }
              }
            } else {
              // Fallback to filename-based detection
              mediaType = this.getMediaType(fileName);
            }
          }

          currentMessage = {
            timestamp: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
            sender: actualSender || 'Unknown',
            message: processedMessage,
            media,
            mediaType,
            mediaData,
            date: formattedDate
          };
        }

        messages.push(currentMessage as ChatMessage);
        messageIndex++;
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

  downloadPDF(pdfData: ArrayBuffer | undefined, fileName: string): void {
    if (!pdfData) return;
    
    // Extract filename from the message text
    const cleanFileName = fileName.replace('📎 ', '').replace('.pdf', '') + '.pdf';
    
    // Create blob and download
    const blob = new Blob([pdfData], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = cleanFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  previewPDF(pdfData: ArrayBuffer | undefined): void {
    if (!pdfData) return;
    
    // Create blob and open in new tab
    const blob = new Blob([pdfData], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  getPDFFileName(messageText: string): string {
    // Extract filename from the message text
    return messageText.replace('📎 ', '');
  }

  getStickerName(messageText: string): string {
    // Extract sticker name from the message text
    return messageText.replace('😀 ', '');
  }

  ngOnDestroy(): void {
    // Clean up blob URLs to prevent memory leaks
    Object.values(this.mediaFiles).forEach(url => {
      URL.revokeObjectURL(url);
    });
  }

  getMediaType(fileName: string): string {
    // First check if we have detected the actual file type from metadata
    if (this.mediaFileTypes[fileName]) {
      return this.mediaFileTypes[fileName];
    }
    
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
        return 'application/pdf';
      case 'opus':
        return 'audio/opus';
      case 'mp3':
      case 'wav':
      case 'm4a':
        return 'audio/' + ext;
      case 'txt':
        return 'text/plain';
      default:
        // Handle files without extension or unknown extensions
        if (fileName.toLowerCase().includes('doc-')) {
          return 'application/pdf';
        }
        if (fileName.toLowerCase().includes('ptt-') || fileName.toLowerCase().includes('.opus')) {
          return 'audio/opus';
        }
        return 'application/octet-stream';
    }
  }
}