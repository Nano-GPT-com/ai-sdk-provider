import { NoSuchModelError, type ProviderV2 } from '@ai-sdk/provider';
import { NanoGPTClient } from './client';
import { createNanoGPTChatModel } from './chat';
import type { NanoGPTModelId, NanoGPTProviderOptions } from './types';

export interface NanoGPTProvider extends ProviderV2 {
  readonly client: NanoGPTClient;
}

const UNSUPPORTED_MESSAGE = 'NanoGPT provider does not implement this model type yet.';

export function createNanoGPT(options: NanoGPTProviderOptions): NanoGPTProvider {
  const client = new NanoGPTClient(options);

  return {
    client,
    languageModel(modelId: string) {
      return createNanoGPTChatModel(client, modelId as NanoGPTModelId);
    },
    textEmbeddingModel(modelId: string) {
      throw new NoSuchModelError({
        errorName: 'NanoGPTTextEmbeddingModelNotImplemented',
        modelId,
        modelType: 'textEmbeddingModel',
        message: UNSUPPORTED_MESSAGE,
      });
    },
    imageModel(modelId: string) {
      throw new NoSuchModelError({
        errorName: 'NanoGPTImageModelNotImplemented',
        modelId,
        modelType: 'imageModel',
        message: UNSUPPORTED_MESSAGE,
      });
    },
  };
}
