import { User, Bot, Wrench, CheckCircle, XCircle } from 'lucide-react';
import { ConversationMessage } from '../types';

interface ChatMessageProps {
  message: ConversationMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex space-x-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="flex-shrink-0">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
            <Bot size={16} className="text-white" />
          </div>
        </div>
      )}
      
      <div className={`max-w-[80%] ${isUser ? 'order-2' : ''}`}>
        <div className={`rounded-lg px-4 py-2 ${
          isUser 
            ? 'bg-blue-600 text-white' 
            : 'bg-gray-800 border border-gray-700'
        }`}>
          <div className="whitespace-pre-wrap text-sm">
            {message.content}
          </div>
          
          {/* Tool calls */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="text-xs text-gray-300 font-medium">Tool calls:</div>
              {message.toolCalls.map((toolCall, index) => (
                <div key={index} className="bg-gray-700 rounded p-2 text-xs">
                  <div className="flex items-center space-x-2 mb-1">
                    <Wrench size={12} />
                    <span className="font-medium">{toolCall.name}</span>
                  </div>
                  <pre className="text-gray-300 overflow-x-auto">
                    {JSON.stringify(toolCall.parameters, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
          
          {/* Tool results */}
          {message.toolResults && message.toolResults.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="text-xs text-gray-300 font-medium">Results:</div>
              {message.toolResults.map((result, index) => (
                <div key={index} className="bg-gray-700 rounded p-2 text-xs">
                  <div className="flex items-center space-x-2 mb-1">
                    {result.result.success ? (
                      <CheckCircle size={12} className="text-green-400" />
                    ) : (
                      <XCircle size={12} className="text-red-400" />
                    )}
                    <span className="font-medium">{result.name}</span>
                  </div>
                  <div className="text-gray-300">
                    {result.result.success ? (
                      <pre className="overflow-x-auto whitespace-pre-wrap">
                        {result.result.output || 'Success'}
                      </pre>
                    ) : (
                      <div className="text-red-300">
                        {result.result.error}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className={`text-xs text-gray-500 mt-1 ${isUser ? 'text-right' : 'text-left'}`}>
          {message.timest.toLocaleTimeString()}
        </div>
      </div>
      
      {isUser && (
        <div className="flex-shrink-0 order-1">
          <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
            <User size={16} className="text-white" />
          </div>
        </div>
      )}
    </div>
  );
}
