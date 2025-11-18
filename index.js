/**
 * PopChoice - Movie Recommendation Application
 * 
 * Main application controller managing UI state, user interactions,
 * and integration with OpenAI embeddings and Supabase vector search.
 * 
 * Architecture:
 * - AppController: Main application orchestrator
 * - UIManager: Handles screen transitions and DOM updates
 * - FormManager: Manages form input collection and validation
 * - MovieService: Handles API calls to OpenAI and Supabase
 */

import { openai, supabase } from './config.js';

// ============================================================================
// Constants & Configuration
// ============================================================================

const CONFIG = {
  SCREENS: {
    QUESTIONS: 'screen1',
    RESULTS: 'screen2'
  },
  INPUTS: {
    FAVORITE_MOVIE: 'favoriteMovieInput',
    MOOD: 'moodInput',
    FUN: 'funInput'
  },
  BUTTONS: {
    LETS_GO: 'letsGoButton',
    GO_AGAIN: 'goAgainButton'
  },
  SELECTORS: {
    MOVIE_TITLE: '#screen2 .movie-title',
    MOVIE_DESCRIPTION: '#screen2 .movie-description'
  },
  API: {
    EMBEDDING_MODEL: 'text-embedding-ada-002',
    CHAT_MODEL: 'gpt-4o-mini', // Use GPT-4o-mini for recommendations
    MATCH_THRESHOLD: 0.50,
    MATCH_COUNT: 1,
    MAX_RESULTS_TO_CHECK: 5, // Fetch more results to filter out favorite movie
    MOVIES_EXAMPLES_PATH: '/movies.txt' // Path to movies.txt examples (served from public folder in Vite)
  },
  MESSAGES: {
    LOADING: {
      TITLE: 'Loading...',
      DESCRIPTION: 'Finding your perfect movie match...'
    },
    ERROR: {
      TITLE: 'Error',
      DESCRIPTION: 'An error occurred while finding your movie recommendation. Please try again.'
    },
    NO_MATCH: {
      TITLE: 'No Match Found',
      DESCRIPTION: 'We couldn\'t find a movie that matches your preferences. Please try again with different inputs.'
    },
    VALIDATION: {
      EMPTY_FIELDS: 'Please fill in all three fields before continuing.',
      FAVORITE_MOVIE_MISSING: 'Please tell us about your favorite movie and why you like it.',
      MOOD_MISSING: 'Please let us know what kind of movie you\'re in the mood for.',
      FUN_MISSING: 'Please tell us if you want something fun or serious.'
    }
  }
};

// ============================================================================
// UIManager - Handles screen transitions and DOM updates
// ============================================================================

class UIManager {
  constructor() {
    this.screens = {
      questions: null,
      results: null
    };
    this.elements = {
      movieTitle: null,
      movieDescription: null,
      validationMessage: null
    };
  }

  /**
   * Initializes UI elements from the DOM
   * @throws {Error} If required elements are not found
   */
  initialize() {
    this.screens.questions = document.getElementById(CONFIG.SCREENS.QUESTIONS);
    this.screens.results = document.getElementById(CONFIG.SCREENS.RESULTS);
    
    if (!this.screens.questions || !this.screens.results) {
      throw new Error('Required screen elements not found in DOM');
    }

    this.elements.movieTitle = document.querySelector(CONFIG.SELECTORS.MOVIE_TITLE);
    this.elements.movieDescription = document.querySelector(CONFIG.SELECTORS.MOVIE_DESCRIPTION);
    this.elements.validationMessage = document.getElementById('validationMessage');
  }

  /**
   * Transitions to the specified screen
   * @param {number} screenNumber - Screen to show (1 = Questions, 2 = Results)
   */
  showScreen(screenNumber) {
    // Hide all screens
    Object.values(this.screens).forEach(screen => {
      screen?.classList.remove('active');
    });

    // Show requested screen
    if (screenNumber === 1 && this.screens.questions) {
      this.screens.questions.classList.add('active');
    } else if (screenNumber === 2 && this.screens.results) {
      this.screens.results.classList.add('active');
    }
  }

  /**
   * Updates the movie recommendation display
   * @param {string} title - Movie title
   * @param {string} description - Movie description
   */
  displayMovie(title, description) {
    if (this.elements.movieTitle) {
      this.elements.movieTitle.textContent = title;
    }
    if (this.elements.movieDescription) {
      this.elements.movieDescription.textContent = description;
    }
  }

  /**
   * Displays loading state
   */
  showLoading() {
    this.displayMovie(
      CONFIG.MESSAGES.LOADING.TITLE,
      CONFIG.MESSAGES.LOADING.DESCRIPTION
    );
  }

  /**
   * Displays error state
   * @param {string} [customMessage] - Optional custom error message
   */
  showError(customMessage) {
    this.displayMovie(
      CONFIG.MESSAGES.ERROR.TITLE,
      customMessage || CONFIG.MESSAGES.ERROR.DESCRIPTION
    );
  }

  /**
   * Shows validation error message on questions screen
   * @param {string} message - Validation error message to display
   */
  showValidationError(message) {
    if (this.elements.validationMessage) {
      this.elements.validationMessage.textContent = message;
      this.elements.validationMessage.classList.add('visible');
    }
  }

  /**
   * Hides validation error message
   */
  hideValidationError() {
    if (this.elements.validationMessage) {
      this.elements.validationMessage.textContent = '';
      this.elements.validationMessage.classList.remove('visible');
    }
  }
}

// ============================================================================
// FormManager - Manages form input collection and validation
// ============================================================================

class FormManager {
  constructor() {
    this.inputs = {
      favoriteMovie: null,
      mood: null,
      fun: null
    };
    this.onSubmitCallback = null;
  }

  /**
   * Initializes form input references from the DOM
   * @param {Function} onSubmitCallback - Callback function to call when form should be submitted
   */
  initialize(onSubmitCallback) {
    this.inputs.favoriteMovie = document.getElementById(CONFIG.INPUTS.FAVORITE_MOVIE);
    this.inputs.mood = document.getElementById(CONFIG.INPUTS.MOOD);
    this.inputs.fun = document.getElementById(CONFIG.INPUTS.FUN);
    this.onSubmitCallback = onSubmitCallback;

    // Add Enter key support to all inputs
    this.attachEnterKeyListeners();
  }

  /**
   * Attaches Enter key event listeners to all form inputs
   * Enter key in any field triggers form submission
   */
  attachEnterKeyListeners() {
    const allInputs = [
      this.inputs.favoriteMovie,
      this.inputs.mood,
      this.inputs.fun
    ].filter(Boolean);

    allInputs.forEach(input => {
      input.addEventListener('keydown', (e) => {
        // Handle Enter key (but not Shift+Enter for textarea)
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (this.onSubmitCallback) {
            this.onSubmitCallback();
          }
        }
      });
    });
  }

  /**
   * Validates that all required fields are filled
   * @returns {{isValid: boolean, missingFields: string[], message: string}} Validation result
   */
  validate() {
    const favoriteMovie = this.inputs.favoriteMovie?.value.trim() || '';
    const mood = this.inputs.mood?.value.trim() || '';
    const fun = this.inputs.fun?.value.trim() || '';

    const missingFields = [];
    if (!favoriteMovie) missingFields.push('favoriteMovie');
    if (!mood) missingFields.push('mood');
    if (!fun) missingFields.push('fun');

    let message = '';
    if (missingFields.length > 0) {
      if (missingFields.length === 3) {
        message = CONFIG.MESSAGES.VALIDATION.EMPTY_FIELDS;
      } else if (missingFields.length === 1) {
        if (missingFields[0] === 'favoriteMovie') {
          message = CONFIG.MESSAGES.VALIDATION.FAVORITE_MOVIE_MISSING;
        } else if (missingFields[0] === 'mood') {
          message = CONFIG.MESSAGES.VALIDATION.MOOD_MISSING;
        } else {
          message = CONFIG.MESSAGES.VALIDATION.FUN_MISSING;
        }
      } else {
        message = CONFIG.MESSAGES.VALIDATION.EMPTY_FIELDS;
      }
    }

    return {
      isValid: missingFields.length === 0,
      missingFields,
      message
    };
  }

  /**
   * Extracts the movie title from the favorite movie input
   * Attempts to identify the movie title from free-form text
   * @returns {string|null} Extracted movie title or null if not found
   */
  getFavoriteMovieTitle() {
    const favoriteMovie = this.inputs.favoriteMovie?.value.trim() || '';
    if (!favoriteMovie) {
      return null;
    }

    // Try to extract movie title - look for common patterns
    // Pattern 1: "Movie Title (Year)" or "Movie Title: description"
    const titleWithYear = favoriteMovie.match(/^([^(]+?)\s*\(?\d{4}\)?/);
    if (titleWithYear) {
      return titleWithYear[1].trim();
    }

    // Pattern 2: "Movie Title" followed by colon or common words
    const titleWithColon = favoriteMovie.match(/^([^:]+?)(?:\s*[:]|because|since|as|when)/i);
    if (titleWithColon) {
      return titleWithColon[1].trim();
    }

    // Pattern 3: First sentence or first 50 characters (likely the title)
    const firstSentence = favoriteMovie.split(/[.!?]/)[0].trim();
    if (firstSentence.length > 0 && firstSentence.length < 100) {
      return firstSentence;
    }

    // Fallback: return first 50 characters
    return favoriteMovie.substring(0, 50).trim();
  }

  /**
   * Collects and combines all user inputs into a query string
   * @returns {string} Combined user input for embedding generation
   */
  getUserInput() {
    const favoriteMovie = this.inputs.favoriteMovie?.value.trim() || '';
    const mood = this.inputs.mood?.value.trim() || '';
    const fun = this.inputs.fun?.value.trim() || '';

    const parts = [];
    if (favoriteMovie) {
      parts.push(`Favorite movie: ${favoriteMovie}`);
    }
    if (mood) {
      parts.push(`Mood preference: ${mood}`);
    }
    if (fun) {
      parts.push(`Entertainment preference: ${fun}`);
    }

    // Return combined input or default query
    return parts.length > 0 ? parts.join('. ') : 'What movie should I watch?';
  }

  /**
   * Resets all form inputs to empty state
   */
  reset() {
    Object.values(this.inputs).forEach(input => {
      if (input) {
        input.value = '';
      }
    });
  }
}

// ============================================================================
// MovieService - Handles API interactions
// ============================================================================

class MovieService {
  constructor() {
    this.moviesExamples = null; // Cache for movies.txt content
  }

  /**
   * Loads movies.txt examples for ChatGPT prompt
   * @returns {Promise<string>} Content of movies.txt
   */
  async loadMoviesExamples() {
    if (this.moviesExamples) {
      return this.moviesExamples;
    }

    try {
      const response = await fetch(CONFIG.API.MOVIES_EXAMPLES_PATH);
      if (!response.ok) {
        throw new Error(`Failed to load movies examples: ${response.statusText}`);
      }
      this.moviesExamples = await response.text();
      return this.moviesExamples;
    } catch (error) {
      console.warn('Could not load movies.txt, proceeding without examples:', error);
      return ''; // Return empty string if file can't be loaded
    }
  }

  /**
   * Generates an embedding vector from text input
   * @param {string} text - Input text to embed
   * @returns {Promise<number[]>} Embedding vector
   * @throws {Error} If embedding generation fails
   */
  async generateEmbedding(text) {
    try {
      const response = await openai.embeddings.create({
        model: CONFIG.API.EMBEDDING_MODEL,
        input: text
      });

      if (!response?.data?.[0]?.embedding) {
        throw new Error('Invalid embedding response from OpenAI');
      }

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Checks if a movie content matches the favorite movie title
   * @param {string} content - Movie content from database
   * @param {string} favoriteMovieTitle - User's favorite movie title
   * @returns {boolean} True if the movie matches the favorite
   */
  isFavoriteMovie(content, favoriteMovieTitle) {
    if (!favoriteMovieTitle) {
      return false;
    }

    // Normalize both strings for comparison
    const normalize = (str) => str.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const normalizedContent = normalize(content);
    const normalizedFavorite = normalize(favoriteMovieTitle);

    // Check if favorite movie title appears in the content
    // Extract title from content (format: "Title (Year): Description")
    const contentTitleMatch = content.match(/^([^(]+)/);
    if (contentTitleMatch) {
      const contentTitle = normalize(contentTitleMatch[1].trim());
      // Check if titles match (allowing for partial matches)
      if (contentTitle.includes(normalizedFavorite) || normalizedFavorite.includes(contentTitle)) {
        return true;
      }
    }

    // Also check if favorite title appears anywhere in content
    return normalizedContent.includes(normalizedFavorite);
  }


  /**
   * Parses movie content to extract title and description
   * @param {string} content - Raw movie content from database
   * @returns {{title: string, description: string}} Parsed movie data
   */
  parseMovieContent(content) {
    // Expected format: "Title (Year): Description"
    const titleMatch = content.match(/^([^(]+)\s*\((\d{4})\)/);
    
    if (titleMatch) {
      const title = `${titleMatch[1].trim()} (${titleMatch[2]})`;
      const description = content.replace(/^[^(]+\(\d{4}\)[:\s]*/, '').trim();
      return { title, description };
    }

    // Fallback for unexpected format
    return {
      title: 'Movie Recommendation',
      description: content
    };
  }

  /**
   * Uses ChatGPT to format recommendation in the style of movies.txt
   * Acts as an expert movie recommender
   * @param {string} userInput - User's preferences
   * @param {string} favoriteMovieTitle - User's favorite movie (to exclude)
   * @param {Array<{content: string, similarity: number}>} candidateMovies - Candidate movies from vector search
   * @returns {Promise<{title: string, description: string}>} Formatted recommendation
   */
  async getChatGPTRecommendation(userInput, favoriteMovieTitle, candidateMovies) {
    try {
      const moviesExamples = await this.loadMoviesExamples();
      
      // Build candidate movies list for ChatGPT
      const candidatesText = candidateMovies.map((movie, index) => {
        const parsed = this.parseMovieContent(movie.content);
        return `${index + 1}. ${parsed.title}\n   ${parsed.description}`;
      }).join('\n\n');

      const systemPrompt = `You are an expert movie recommender. Your job is to recommend movies to users based on their preferences.

Here are examples of how to format movie recommendations (from movies.txt):

${moviesExamples}

IMPORTANT RULES:
1. DO NOT recommend the movie "${favoriteMovieTitle}" - the user already mentioned it as their favorite
2. Choose the BEST match from the candidate movies provided that is NOT "${favoriteMovieTitle}"
3. Format your response EXACTLY like the examples above:
   - First line: "Title: Year | Rating | Duration | Rating"
   - Second line: A compelling description in the style of the examples (2-3 sentences)
4. If the candidate movies don't have all the metadata (year, rating, duration), use the format from the database content
5. Be enthusiastic and match the tone of the examples

Respond with ONLY the formatted recommendation, nothing else.`;

      const userPrompt = `User preferences:
${userInput}

${favoriteMovieTitle ? `User's favorite movie (DO NOT recommend this): ${favoriteMovieTitle}` : ''}

Candidate movies from our database:
${candidatesText}

Please recommend the best movie from the candidates that matches the user's preferences, excluding "${favoriteMovieTitle}". Format it exactly like the examples.`;

      const response = await openai.chat.completions.create({
        model: CONFIG.API.CHAT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 300
      });

      const recommendationText = response.choices[0]?.message?.content?.trim();
      if (!recommendationText) {
        throw new Error('Empty response from ChatGPT');
      }

      // Parse the ChatGPT response
      return this.parseChatGPTResponse(recommendationText);
    } catch (error) {
      console.error('Error getting ChatGPT recommendation:', error);
      // Fallback to direct parsing if ChatGPT fails
      if (candidateMovies.length > 0) {
        return this.parseMovieContent(candidateMovies[0].content);
      }
      throw error;
    }
  }

  /**
   * Parses ChatGPT response into title and description
   * @param {string} response - ChatGPT response text
   * @returns {{title: string, description: string}} Parsed recommendation
   */
  parseChatGPTResponse(response) {
    const lines = response.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      throw new Error('Invalid ChatGPT response format');
    }

    // First line should be the title with metadata
    const titleLine = lines[0].trim();
    // Extract just the title part (before the first | or :)
    const titleMatch = titleLine.match(/^([^:|]+)/);
    const title = titleMatch ? titleMatch[1].trim() : titleLine;

    // Rest of the lines are the description
    const description = lines.slice(1).join(' ').trim() || lines[0];

    return { title, description };
  }

  /**
   * Finds a movie recommendation based on user input
   * Uses vector search to find candidates, then ChatGPT to format the recommendation
   * @param {string} userInput - Combined user input text
   * @param {string} [excludeTitle] - Movie title to exclude from results (user's favorite)
   * @returns {Promise<{title: string, description: string}>} Movie recommendation
   */
  async getRecommendation(userInput, excludeTitle = null) {
    const embedding = await this.generateEmbedding(userInput);
    
    // Get multiple candidate movies
    const candidates = await this.findMatchingMovies(embedding, excludeTitle, CONFIG.API.MAX_RESULTS_TO_CHECK);

    if (!candidates || candidates.length === 0) {
      return {
        title: CONFIG.MESSAGES.NO_MATCH.TITLE,
        description: CONFIG.MESSAGES.NO_MATCH.DESCRIPTION
      };
    }

    // Use ChatGPT to format the recommendation in the style of movies.txt
    try {
      return await this.getChatGPTRecommendation(userInput, excludeTitle, candidates);
    } catch (error) {
      console.error('ChatGPT recommendation failed, using direct match:', error);
      // Fallback to direct parsing
      return this.parseMovieContent(candidates[0].content);
    }
  }

  /**
   * Finds multiple matching movies using vector similarity
   * @param {number[]} embedding - Query embedding vector
   * @param {string} [excludeTitle] - Movie title to exclude from results
   * @param {number} count - Number of results to return
   * @returns {Promise<Array<{content: string, similarity: number}>>} Matching movies
   * @throws {Error} If search fails
   */
  async findMatchingMovies(embedding, excludeTitle = null, count = 5) {
    try {
      const { data, error } = await supabase.rpc('match_movies', {
        query_embedding: embedding,
        match_threshold: CONFIG.API.MATCH_THRESHOLD,
        match_count: count
      });

      if (error) {
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!data || data.length === 0) {
        return [];
      }

      // Filter out the favorite movie if provided
      if (excludeTitle) {
        return data.filter(movie => 
          !this.isFavoriteMovie(movie.content, excludeTitle)
        );
      }

      return data;
    } catch (error) {
      console.error('Error finding matching movies:', error);
      throw new Error(`Failed to find matching movies: ${error.message}`);
    }
  }
}

// ============================================================================
// AppController - Main application orchestrator
// ============================================================================

class AppController {
  constructor() {
    this.ui = new UIManager();
    this.form = new FormManager();
    this.movieService = new MovieService();
    this.isProcessing = false;
  }

  /**
   * Initializes the application
   * Sets up DOM references and event listeners
   */
  initialize() {
    try {
      this.ui.initialize();
      // Pass submit callback to form manager for Enter key support
      this.form.initialize(() => this.handleLetsGoClick());
      this.attachEventListeners();
      this.attachInputListeners();
      this.ui.showScreen(1);
    } catch (error) {
      console.error('Failed to initialize application:', error);
      throw error;
    }
  }

  /**
   * Attaches input listeners to hide validation errors when user types
   */
  attachInputListeners() {
    const allInputs = [
      this.form.inputs.favoriteMovie,
      this.form.inputs.mood,
      this.form.inputs.fun
    ].filter(Boolean);

    allInputs.forEach(input => {
      input.addEventListener('input', () => {
        // Hide validation error when user starts typing
        this.ui.hideValidationError();
      });
    });
  }

  /**
   * Attaches event listeners to navigation buttons
   */
  attachEventListeners() {
    const letsGoButton = document.getElementById(CONFIG.BUTTONS.LETS_GO);
    const goAgainButton = document.getElementById(CONFIG.BUTTONS.GO_AGAIN);

    if (letsGoButton) {
      letsGoButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleLetsGoClick();
      });
    } else {
      console.warn(`Button not found: ${CONFIG.BUTTONS.LETS_GO}`);
    }

    if (goAgainButton) {
      goAgainButton.addEventListener('click', () => {
        this.handleGoAgainClick();
      });
    }
  }

  /**
   * Handles "Let's Go" button click or Enter key press
   * Validates form, then collects user input, transitions to results screen, and fetches recommendation
   */
  async handleLetsGoClick() {
    if (this.isProcessing) {
      return; // Prevent multiple simultaneous requests
    }

    // Validate all fields are filled
    const validation = this.form.validate();
    if (!validation.isValid) {
      this.ui.showValidationError(validation.message);
      return;
    }

    // Hide any previous validation errors
    this.ui.hideValidationError();

    this.isProcessing = true;

    try {
      const userInput = this.form.getUserInput();
      const favoriteMovieTitle = this.form.getFavoriteMovieTitle();
      
      // Show results screen immediately for better UX
      this.ui.showScreen(2);
      this.ui.showLoading();

      // Fetch and display recommendation (excluding favorite movie)
      const recommendation = await this.movieService.getRecommendation(userInput, favoriteMovieTitle);
      this.ui.displayMovie(recommendation.title, recommendation.description);
    } catch (error) {
      console.error('Error in recommendation flow:', error);
      this.ui.showError(error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Handles "Go Again" button click
   * Resets form, clears validation errors, and returns to questions screen
   */
  handleGoAgainClick() {
    this.form.reset();
    this.ui.hideValidationError();
    this.ui.showScreen(1);
  }
}

// ============================================================================
// Application Bootstrap
// ============================================================================

/**
 * Initializes the application when DOM is ready
 */
function initializeApp() {
  const app = new AppController();
  app.initialize();
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// Export for potential testing or external use
export { AppController, UIManager, FormManager, MovieService };
