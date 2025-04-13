'use server';
import { encode } from 'gpt-tokenizer';

// Function to simulate AI model tokenization
export const approximateTokenCount = async (text: string) => {
  try {
    const encoded = encode(text);
    return encoded.length;
  } catch (error) {
    console.error("Error encoding text:", error);
    return 0;
  }
};
