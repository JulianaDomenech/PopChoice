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
 * Chunks text into smaller pieces for embedding with proper overlap
 * @param {string} text - The text to chunk
 * @param {number} chunkSize - Maximum characters per chunk
 * @param {number} overlap - Number of characters to overlap between chunks
 * @returns {string[]} Array of text chunks
 */
function chunkText(text, chunkSize = 500, overlap = 50) {
  const chunks = [];
  let currentPos = 0;
  
  while (currentPos < text.length) {
    // Determine where this chunk should end
    let chunkEnd = Math.min(currentPos + chunkSize, text.length);
    
    // If not at the end, try to break at a sentence boundary
    if (chunkEnd < text.length) {
      const searchStart = Math.max(currentPos, chunkEnd - 150);
      
      // Look for sentence boundary (period followed by space or end of text)
      let sentenceEnd = -1;
      for (let i = chunkEnd - 1; i >= searchStart; i--) {
        if (text[i] === '.' && (i === text.length - 1 || text[i + 1] === ' ' || text[i + 1] === '\n')) {
          sentenceEnd = i + 1;
          break;
        }
      }
      
      if (sentenceEnd > searchStart) {
        chunkEnd = sentenceEnd;
      } else {
        // Fall back to word boundary
        const wordBoundary = text.lastIndexOf(' ', chunkEnd);
        if (wordBoundary > searchStart) {
          chunkEnd = wordBoundary + 1;
        }
      }
    }
    
    // Extract chunk and trim whitespace
    const chunk = text.slice(currentPos, chunkEnd).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    
    // If we've reached the end, stop
    if (chunkEnd >= text.length) {
      break;
    }
    
    // Calculate next position with guaranteed overlap
    // The overlap region is the last 'overlap' characters before chunkEnd
    // The next chunk MUST include this overlap region at its start
    let nextStart = chunkEnd - overlap;
    
    // Ensure we move forward
    if (nextStart <= currentPos) {
      nextStart = currentPos + Math.max(1, chunkSize - overlap);
    }
    
    // Don't go past the end
    if (nextStart >= text.length) {
      break;
    }
    
    // Verify overlap will be preserved
    // The overlap text is: text.slice(chunkEnd - overlap, chunkEnd)
    // The next chunk should start at: nextStart
    // So the next chunk's first 'overlap' chars should match: text.slice(chunkEnd - overlap, chunkEnd)
    // This means: nextStart should be <= chunkEnd - overlap (so the overlap region is included)
    // But we also need: nextStart >= chunkEnd - overlap (to ensure we're not going backwards)
    
    // Actually, to guarantee overlap, nextStart MUST be exactly chunkEnd - overlap
    // But we can adjust slightly for word boundaries as long as the overlap region is still included
    const requiredOverlapStart = chunkEnd - overlap;
    
    // Try to find a word boundary near the required overlap start
    const spaceBefore = text.lastIndexOf(' ', nextStart);
    const spaceAfter = text.indexOf(' ', nextStart);
    
    // Adjust to word boundary, but ensure overlap region is still included in next chunk
    if (spaceBefore >= requiredOverlapStart && spaceBefore < nextStart) {
      // Can move to space before, as long as overlap region (requiredOverlapStart to chunkEnd) is still in next chunk
      nextStart = spaceBefore + 1;
    } else if (spaceAfter > nextStart && spaceAfter <= chunkEnd) {
      // Can move to space after, but only if it doesn't skip the overlap region
      if (spaceAfter >= requiredOverlapStart) {
        nextStart = spaceAfter + 1;
      }
    }
    
    // Final check: ensure overlap region will be in the next chunk
    // The overlap region is: text.slice(requiredOverlapStart, chunkEnd)
    // The next chunk will be: text.slice(nextStart, ...)
    // For overlap to work: nextStart must be <= requiredOverlapStart
    if (nextStart > requiredOverlapStart) {
      // Force overlap by starting at the required position
      nextStart = requiredOverlapStart;
    }
    
    // Ensure we still move forward
    if (nextStart <= currentPos) {
      nextStart = currentPos + 1;
    }
    
    currentPos = nextStart;
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
    
    // Verify overlap for movies with multiple chunks
    if (chunks.length > 1) {
      console.log(`  → Verifying overlap between chunks...`);
      for (let i = 0; i < chunks.length - 1; i++) {
        const currentChunk = chunks[i];
        const nextChunk = chunks[i + 1];
        // Check if the end of current chunk overlaps with start of next chunk
        const overlapSize = 50;
        const currentEnd = currentChunk.slice(-overlapSize);
        const nextStart = nextChunk.slice(0, overlapSize);
        
        // Check for actual text overlap (not just whitespace)
        const currentEndWords = currentEnd.trim().split(/\s+/).filter(w => w.length > 0);
        const nextStartWords = nextStart.trim().split(/\s+/).filter(w => w.length > 0);
        
        // Check if at least 3 words overlap
        let overlapCount = 0;
        for (let j = 0; j < Math.min(currentEndWords.length, nextStartWords.length); j++) {
          if (currentEndWords[currentEndWords.length - 1 - j] === nextStartWords[j]) {
            overlapCount++;
          } else {
            break;
          }
        }
        
        if (overlapCount >= 3 || nextStart.toLowerCase().includes(currentEnd.slice(-20).toLowerCase()) || currentEnd.toLowerCase().includes(nextStart.slice(0, 20).toLowerCase())) {
          console.log(`    ✓ Chunk ${i + 1} and ${i + 2} have overlapping content (${overlapCount} words overlap)`);
          console.log(`      Chunk ${i + 1} ends: "...${currentChunk.slice(-30)}"`);
          console.log(`      Chunk ${i + 2} starts: "${nextChunk.slice(0, 30)}..."`);
        } else {
          console.log(`    ⚠ Chunk ${i + 1} and ${i + 2} may not have proper overlap`);
          console.log(`      Chunk ${i + 1} ends: "...${currentChunk.slice(-30)}"`);
          console.log(`      Chunk ${i + 2} starts: "${nextChunk.slice(0, 30)}..."`);
        }
      }
    }
    
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
