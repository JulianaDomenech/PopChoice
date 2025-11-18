/**
 * Prep Supabase Embeddings Script
 * This script chunks movie content, generates embeddings, and stores them in Supabase
 * 
 * Usage: node prep-supabase-embeddings.js
 * 
 * Environment Variables (.env file format):
 * - Copy .env.example to .env and add your actual API keys
 * - Format: KEY=value (NO quotes around values)
 * - Example: OPENAI_API_KEY=sk-abc123...
 * - Example: SUPABASE_URL=https://your-project.supabase.co
 * 
 * Required variables:
 * - OPENAI_API_KEY: Your OpenAI API key
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_API_KEY: Your Supabase API key
 */

import 'dotenv/config';
import { openai, supabase } from './config.js';
import movies from './content.js';

/**
 * Chunks text into smaller pieces for embedding
 * @param {string} text - The text to chunk
 * @param {number} chunkSize - Maximum characters per chunk
 * @param {number} overlap - Number of characters to overlap between chunks
 * @returns {string[]} Array of text chunks
 */
function chunkText(text, chunkSize = 500, overlap = 50) {
  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    let end = start + chunkSize;
    
    // Try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      const lastSpace = text.lastIndexOf(' ', end);
      const breakPoint = lastPeriod > start ? lastPeriod + 1 : (lastSpace > start ? lastSpace : end);
      end = breakPoint;
    }
    
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    
    // Move start position with overlap
    start = end - overlap;
    if (start >= text.length) break;
  }
  
  return chunks;
}

/**
 * Main function to process movies, chunk content, and create embeddings
 * @param {Array} moviesArray - Array of movie objects
 */
async function main(moviesArray) {
  console.log(`Processing ${moviesArray.length} movies...\n`);
  
  let totalChunks = 0;
  const allChunks = [];
  
  // Step 1: Chunk all movie content
  for (const movie of moviesArray) {
    console.log(`Chunking content for: ${movie.title}`);
    const chunks = chunkText(movie.content);
    console.log(`  → Created ${chunks.length} chunks`);
    totalChunks += chunks.length;
    
    // Store chunks with movie context
    chunks.forEach((chunk, index) => {
      allChunks.push({
        movieTitle: movie.title,
        chunkIndex: index,
        content: chunk
      });
    });
  }
  
  console.log(`\nTotal chunks to process: ${totalChunks}\n`);
  
  // Step 2: Generate embeddings for all chunks
  console.log('Generating embeddings...');
  const dataWithEmbeddings = await Promise.all(
    allChunks.map(async (chunk, index) => {
      if ((index + 1) % 10 === 0) {
        console.log(`  → Processed ${index + 1}/${totalChunks} chunks...`);
      }
      
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: chunk.content
      });
      
      return {
        content: chunk.content,
        embedding: embeddingResponse.data[0].embedding
      };
    })
  );
  
  console.log(`\n✅ Generated ${dataWithEmbeddings.length} embeddings\n`);
  
  // Step 3: Clear existing data from the table
  console.log('Clearing existing data from movies table...');
  const { error: deleteError } = await supabase.from('movies').delete().neq('id', 0);
  
  if (deleteError) {
    console.error('⚠️  Warning: Could not clear table:', deleteError.message);
    console.log('Continuing with insert (may result in duplicates)...');
  } else {
    console.log('✅ Table cleared successfully\n');
  }
  
  // Step 4: Insert chunks into Supabase in batches
  console.log('Inserting data into Supabase...');
  const batchSize = 100;
  let insertedCount = 0;
  
  for (let i = 0; i < dataWithEmbeddings.length; i += batchSize) {
    const batch = dataWithEmbeddings.slice(i, i + batchSize);
    const { data: insertedData, error } = await supabase
      .from('movies')
      .insert(batch)
      .select();
    
    if (error) {
      console.error(`❌ Error inserting batch ${Math.floor(i / batchSize) + 1}:`, error);
      throw error;
    }
    
    insertedCount += insertedData ? insertedData.length : batch.length;
    console.log(`  → Inserted batch ${Math.floor(i / batchSize) + 1} (${insertedCount}/${dataWithEmbeddings.length} chunks)`);
  }
  
  console.log(`\n✅ Successfully embedded and stored ${insertedCount} chunks from ${moviesArray.length} movies!`);
  console.log('✅ Script completed - table is ready for vector search!');
}

main(movies).catch(error => {
  console.error('\n❌ Script failed:', error);
  process.exit(1);
});
