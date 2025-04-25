declare module 'openai' {
  export interface ChatCompletionMessageParam {
    role: 'user' | 'system' | 'assistant';
    content:
      | Array<{
          type: 'text' | 'image_url';
          text?: string;
          image_url?: {
            url: string;
          };
        }>
      | string;
  }

  export interface ChatCompletion {
    choices: Array<{
      message?: {
        content?: string;
      };
    }>;
  }

  export default class OpenAI {
    constructor(config: { apiKey: string });
    chat: {
      completions: {
        create(params: {
          model: string;
          messages: ChatCompletionMessageParam[];
          max_tokens?: number;
        }): Promise<ChatCompletion>;
      };
    };
  }
}
