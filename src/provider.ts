import { NoSuchModelError, type ProviderV3 } from '@ai-sdk/provider';

import { createNanoGPTChatModel } from './chat';
import { NanoGPTClient } from './client';
import { createNanoGPTEmbeddingModel } from './embeddings';
import type { NanoGPTProviderOptions } from './types';

export interface NanoGPTProvider extends ProviderV3 {
  readonly client: NanoGPTClient;
}

const UNSUPPORTED_MESSAGE = 'NanoGPT provider does not implement this model type yet.';

export function createNanoGPT(options: NanoGPTProviderOptions): NanoGPTProvider {
  const client = new NanoGPTClient(options);

  return {
    client,
    specificationVersion: 'v3',
    languageModel(modelId: string) {
      return createNanoGPTChatModel(client, modelId);
    },
    embeddingModel(modelId: string) {
      return createNanoGPTEmbeddingModel(client, modelId);
    },
    textEmbeddingModel(modelId: string) {
      return createNanoGPTEmbeddingModel(client, modelId);
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
