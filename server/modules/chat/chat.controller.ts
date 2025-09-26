import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('chat')
@Controller('api/chat')
export class ChatController {
  // Chat-specific routes can be added here if needed
  // Utility routes have been moved to UtilityController
}
