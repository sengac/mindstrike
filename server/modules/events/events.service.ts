import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface SseEvent {
  type: string;
  data: Record<string, unknown>;
  id?: string;
}

@Injectable()
export class EventsService {
  private eventSubject = new Subject<SseEvent>();

  // Stubbed service implementation

  getEventStream() {
    return this.eventSubject.asObservable();
  }

  sendEvent(event: SseEvent) {
    this.eventSubject.next(event);
  }

  broadcastToTopic(topic: string, data: Record<string, unknown>) {
    this.sendEvent({
      type: topic,
      data,
      id: Date.now().toString(),
    });
  }
}
