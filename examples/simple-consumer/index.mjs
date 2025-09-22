import { generateText } from 'ai'
import { createNanoGPT } from '@nanogpt/ai-sdk-provider'

const apiKey = process.env.NANOGPT_API_KEY

if (!apiKey) {
  console.error('Set NANOGPT_API_KEY before running this example.')
  process.exit(1)
}

const nanogpt = createNanoGPT({ apiKey })

try {
  const { text } = await generateText({
    model: nanogpt.languageModel('gpt-5'),
    prompt: '? ',
  })

  console.log('\nResponse from NanoGPT:\n')
  console.log(text)
} catch (error) {
  console.error('\nRequest failed:\n')
  console.error(error)
  process.exitCode = 1
}
