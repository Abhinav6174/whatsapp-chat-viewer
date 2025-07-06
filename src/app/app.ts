import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ChatViewerComponent } from "./chat-viewer/chat-viewer.component";

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ChatViewerComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected title = 'whatsapp-chat-viewer';
}
