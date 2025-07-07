import { Component, OnDestroy } from '@angular/core';
import JSZip from 'jszip';
import { format, isToday, isYesterday } from 'date-fns';
import { DisplayItem, Message, MediaMessage, DaySeparator } from '../models/chat.model';
import { CommonModule } from '@angular/common';
import { FormsModule as formsModule } from '@angular/forms';
import heic2any from 'heic2any';

interface ChatMessage {
  timestamp: string;
  sender: string;
  message: string;
  media?: string; // data URL for images/audio/video/pdf
  mediaType?: string;
  mediaData?: string; // for text/VCF, the raw text
  contactPreview?: {
    name?: string;
    phones?: string[];
    emails?: string[];
    photoDataUrl?: string;
    address?: string;
    birthday?: string;
    extraFields?: { [key: string]: string };
    vcfDataUrl?: string;
  };
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
  mediaFileData: { [key: string]: string } = {};
  primaryUser: string = '';
  availableUsers: string[] = [];
  isLoading = false;
  errorMessage: string | null = null;

  // WhatsApp-style message input
  newMessage: string = '';

  // Responsive sidebar state
  sidebarOpen: boolean = false;
  isDesktop: boolean = false;
  private resizeListener: (() => void) | null = null;

  constructor() {
    this.updateIsDesktop();
    this.sidebarOpen = this.isDesktop; // open sidebar by default on desktop
    this.resizeListener = () => {
      const wasDesktop = this.isDesktop;
      this.updateIsDesktop();
      if (this.isDesktop && !wasDesktop) {
        this.sidebarOpen = true;
      } else if (!this.isDesktop && wasDesktop) {
        this.sidebarOpen = false;
      }
    };
    window.addEventListener('resize', this.resizeListener);
  }

  private updateIsDesktop() {
    this.isDesktop = window.matchMedia('(min-width: 768px)').matches;
  }

  async onFileSelected(event: Event) {
    this.isLoading = true;
    this.errorMessage = null;


    try {
      const input = event.target as HTMLInputElement;
      if (!input.files?.length) { this.isLoading = false; return; }
      const file = input.files[0];
      const zip = new JSZip();
      const zipData = await zip.loadAsync(file);
      this.mediaFiles = {};
      this.mediaFileTypes = {};
      this.mediaFileData = {};
      const mediaFileNames = Object.keys(zipData.files).filter(f => !f.endsWith('.txt') && !zipData.files[f].dir);
      for (const fileName of mediaFileNames) {
        const fileData = zipData.files[fileName];
        const arrayBuffer = await fileData.async('arraybuffer');
        const uint8Array = new Uint8Array(arrayBuffer);
        const detectedType = await this.detectFileTypeFromBytes(uint8Array, fileName);
        this.mediaFileTypes[fileName] = detectedType;
        
        // For HEIC images, convert to JPEG using heic2any
        if (detectedType === 'image/heic') {
          try {
            const blob = new Blob([arrayBuffer], { type: 'image/heic' });
            const convertedBlob = await heic2any({ blob, toType: 'image/jpeg', quality: 0.92 });
            // heic2any returns a Blob or an array of Blobs
            const resultBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(resultBlob);
            });
            this.mediaFiles[fileName] = dataUrl;
            this.mediaFileTypes[fileName] = 'image/jpeg';
          } catch (e) {
            // fallback: store as original HEIC if conversion fails
            const base64 = await fileData.async('base64');
            this.mediaFiles[fileName] = `data:${detectedType};base64,${base64}`;
          }
        } else if (detectedType.startsWith('image/') || detectedType.startsWith('audio/') || detectedType.startsWith('video/') || detectedType === 'application/pdf') {
          const base64 = await fileData.async('base64');
          this.mediaFiles[fileName] = `data:${detectedType};base64,${base64}`;
        } else if (detectedType === 'text/vcard' || fileName.toLowerCase().endsWith('.vcf')) {
          // For VCF, store as text
          this.mediaFileData[fileName] = await fileData.async('text');
        } else {
          // For other files, store as base64 data URL
          const base64 = await fileData.async('base64');
          this.mediaFiles[fileName] = `data:${detectedType};base64,${base64}`;
        }
      }
      // Process chat text file
      const chatFile = Object.keys(zipData.files).find(f => f.endsWith('.txt'));
      if (chatFile) {
        this.availableUsers = [];
        this.primaryUser = '';
        const text = await zipData.file(chatFile)?.async('text');
        if (text) {
          this.parseChatText(text);
        }
      } else {
        this.errorMessage = 'No chat file found in the zip. Please upload a valid WhatsApp chat export.';
        return;
      }
    } catch (err: any) {
      this.errorMessage = 'Error loading chats. Please check your file and try again.';
      console.error('Error loading chat:', err);
    } finally {
      this.isLoading = false;
    }
  }

  private async detectFileTypeFromBytes(bytes: Uint8Array, fileName: string): Promise<string> {
    // File signature detection for common formats
    if (this.isPNG(bytes)) return 'image/png';
    if (this.isJPEG(bytes)) return 'image/jpeg';
    if (this.isGIF(bytes)) return 'image/gif';
    if (this.isWebP(bytes)) return 'image/webp';
    if (this.isBMP(bytes)) return 'image/bmp';
    if (this.isTIFF(bytes)) return 'image/tiff';
    if (this.isSVG(bytes)) return 'image/svg+xml';
    if (this.isHEIC(bytes)) return 'image/heic';
    if (this.isHEIF(bytes)) return 'image/heif';
    if (this.isPDF(bytes)) return 'application/pdf';
    if (this.isMP4(bytes)) return 'video/mp4';
    if (this.isMP3(bytes)) return 'audio/mpeg';
    if (this.isOPUS(bytes)) return 'audio/opus';
    if (this.isVCF(bytes) || fileName.toLowerCase().endsWith('.vcf')) return 'text/vcard';
    // fallback to extension
    return this.getMediaType(fileName);
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

  private isBMP(bytes: Uint8Array): boolean {
    return bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4D;
  }

  private isTIFF(bytes: Uint8Array): boolean {
    return bytes.length >= 4 && ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A && bytes[3] === 0x00) || (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00 && bytes[3] === 0x2A));
  }

  private isSVG(bytes: Uint8Array): boolean {
    // SVG is XML text, so not reliable by signature, but check for <svg
    const text = new TextDecoder().decode(bytes.slice(0, 100));
    return text.includes('<svg');
  }

  private isHEIC(bytes: Uint8Array): boolean {
    // HEIC/HEIF: ftypheic or ftypheix or ftyphevc or ftypmif1
    return bytes.length >= 12 && (
      (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) &&
      (
        (bytes[8] === 0x68 && bytes[9] === 0x65 && bytes[10] === 0x69 && bytes[11] === 0x63) ||
        (bytes[8] === 0x68 && bytes[9] === 0x65 && bytes[10] === 0x69 && bytes[11] === 0x78) ||
        (bytes[8] === 0x68 && bytes[9] === 0x65 && bytes[10] === 0x76 && bytes[11] === 0x63) ||
        (bytes[8] === 0x6D && bytes[9] === 0x69 && bytes[10] === 0x66 && bytes[11] === 0x31)
      )
    );
  }

  private isHEIF(bytes: Uint8Array): boolean {
    // ftypheif
    return bytes.length >= 12 && (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70 && bytes[8] === 0x68 && bytes[9] === 0x65 && bytes[10] === 0x69 && bytes[11] === 0x66);
  }

  private isVCF(bytes: Uint8Array): boolean {
    // VCF is text, check for BEGIN:VCARD
    const text = new TextDecoder().decode(bytes.slice(0, 100));
    return text.includes('BEGIN:VCARD');
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
        let mediaData: string | undefined;
        let contactPreview: {
          name?: string;
          phones?: string[];
          emails?: string[];
          photoDataUrl?: string;
          address?: string;
          birthday?: string;
          extraFields?: { [key: string]: string };
          vcfDataUrl?: string;
        } | undefined;
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
              const detectedType = this.mediaFileTypes[mediaFileName];
              mediaType = detectedType;
              if (mediaType && mediaType.startsWith('image/')) {
                media = this.mediaFiles[mediaFileName];
                // If the message is exactly the file attachment (with or without the icon), don't show text
                const onlyFileAttachment =
                  actualMessage.trim() === `${fileName} (file attached)` ||
                  actualMessage.trim() === `${fileName}` ||
                  actualMessage.trim() === `📎 ${fileName}`;
                if (onlyFileAttachment) {
                  processedMessage = '';
                }
              } else if (mediaType && (mediaType.startsWith('audio/') || mediaType.startsWith('video/'))) {
                media = this.mediaFiles[mediaFileName];
              } else if (mediaType === 'application/pdf') {
                media = this.mediaFiles[mediaFileName];
              } else if (mediaType === 'text/vcard') {
                mediaData = this.mediaFileData[mediaFileName];
                contactPreview = this.parseVCF(mediaData);
                contactPreview.vcfDataUrl = this.mediaFiles[mediaFileName];
              } else {
                media = this.mediaFiles[mediaFileName];
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
            contactPreview,
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

  downloadPDF(pdfData: string | undefined, fileName: string): void {
    if (!pdfData) return;
    
    // Extract filename from the message text
    const cleanFileName = fileName.replace('📎 ', '').replace('.pdf', '') + '.pdf';
    
    // Create blob and download
    const blob = new Blob([Buffer.from(pdfData, 'base64')], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = cleanFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  previewPDF(pdfData: string | undefined): void {
    if (!pdfData) return;
    
    // Create blob and open in new tab
    const blob = new Blob([Buffer.from(pdfData, 'base64')], { type: 'application/pdf' });
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
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
    }
    // Clean up blob URLs to prevent memory leaks
    Object.values(this.mediaFiles).forEach(url => {
      URL.revokeObjectURL(url);
    });
  }

  getMediaType(fileName: string): string {
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
      case 'bmp':
      case 'tiff':
      case 'tif':
      case 'svg':
      case 'heic':
      case 'heif':
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
      case 'vcf':
        return 'text/vcard';
      case 'txt':
        return 'text/plain';
      default:
        if (fileName.toLowerCase().includes('doc-')) {
          return 'application/pdf';
        }
        if (fileName.toLowerCase().includes('ptt-') || fileName.toLowerCase().includes('.opus')) {
          return 'audio/opus';
        }
        return 'application/octet-stream';
    }
  }

  private parseVCF(vcfText: string): {
    name?: string;
    phones?: string[];
    emails?: string[];
    photoDataUrl?: string;
    address?: string;
    birthday?: string;
    extraFields?: { [key: string]: string };
    vcfDataUrl?: string;
  } {
    const lines = vcfText.split(/\r?\n/);
    let name = '', photoDataUrl = '', address = '', birthday = '';
    const phones: string[] = [], emails: string[] = [], extraFields: { [key: string]: string } = {};
    let photoBase64 = '', photoType = '';
    for (const line of lines) {
      if (line.startsWith('FN:')) name = line.substring(3).trim();
      else if (line.startsWith('N:') && !name) name = line.substring(2).trim();
      else if (line.match(/^(TEL|item\d+\.TEL)/)) {
        const match = line.match(/:(.+)$/);
        if (match) phones.push(match[1].trim());
      } else if (line.match(/^(EMAIL|item\d+\.EMAIL)/)) {
        const match = line.match(/:(.+)$/);
        if (match) emails.push(match[1].trim());
      } else if (line.startsWith('PHOTO;BASE64:')) {
        photoBase64 = line.replace('PHOTO;BASE64:', '').trim();
        photoType = 'jpeg';
      } else if (line.startsWith('PHOTO;ENCODING=b;TYPE=')) {
        // e.g. PHOTO;ENCODING=b;TYPE=JPEG:
        const typeMatch = line.match(/TYPE=([A-Z0-9]+)/i);
        photoType = typeMatch ? typeMatch[1].toLowerCase() : 'jpeg';
        photoBase64 = line.split(':')[1]?.trim() || '';
      } else if (line.startsWith('item') && line.includes('.ADR')) {
        address = line.split(':')[1]?.trim() || '';
      } else if (line.startsWith('ADR')) {
        address = line.split(':')[1]?.trim() || '';
      } else if (line.startsWith('BDAY')) {
        birthday = line.split(':')[1]?.trim() || '';
      } else if (line && !line.startsWith('BEGIN:VCARD') && !line.startsWith('END:VCARD') && !line.startsWith('VERSION:')) {
        // Store any other fields
        const idx = line.indexOf(':');
        if (idx > 0) {
          const key = line.substring(0, idx);
          const value = line.substring(idx + 1).trim();
          if (!['FN', 'N', 'TEL', 'EMAIL', 'PHOTO', 'ADR', 'BDAY'].some(f => key.includes(f))) {
            extraFields[key] = value;
          }
        }
      }
    }
    if (photoBase64) {
      photoDataUrl = `data:image/${photoType};base64,${photoBase64}`;
    }
    return {
      name,
      phones,
      emails,
      photoDataUrl,
      address,
      birthday,
      extraFields
    };
  }

  previewFile(dataUrl: string | undefined, mediaType: string | undefined): void {
    if (!dataUrl) return;
    window.open(dataUrl, '_blank');
  }

  downloadFile(dataUrl: string | undefined, fileName: string, mediaType: string | undefined): void {
    if (!dataUrl) return;
    // Ensure fileName has an extension
    let ext = '';
    if (mediaType) {
      if (mediaType === 'application/pdf') ext = '.pdf';
      else if (mediaType === 'text/vcard') ext = '.vcf';
      else if (mediaType.startsWith('audio/')) ext = '.mp3';
      else if (mediaType.startsWith('video/')) ext = '.mp4';
      else if (mediaType.startsWith('image/')) ext = '.png';
      else if (mediaType.includes('excel')) ext = '.xlsx';
      else if (mediaType.includes('word')) ext = '.docx';
      else if (mediaType.includes('sql')) ext = '.sql';
      else if (mediaType.includes('zip')) ext = '.zip';
      else if (mediaType.includes('csv')) ext = '.csv';
      else if (mediaType.includes('plain')) ext = '.txt';
    }
    let cleanFileName = fileName;
    if (ext && !fileName.endsWith(ext)) cleanFileName += ext;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = cleanFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  public objectKeys(obj: any): string[] {
    return obj ? Object.keys(obj) : [];
  }

  sendMessage(): void {
    if (!this.newMessage.trim() || !this.primaryUser) return;
    const now = new Date();
    const formattedDate = this.formatDateForDisplay(now);
    this.messages.push({
      timestamp: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      sender: this.primaryUser,
      message: this.newMessage,
      date: formattedDate
    });
    this.newMessage = '';
    setTimeout(() => {
      const container = document.querySelector('.h-[600px].overflow-y-auto');
      if (container) container.scrollTop = container.scrollHeight;
    }, 50);
  }
}