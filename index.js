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
    MATCH_THRESHOLD: 0.50,
    MATCH_COUNT: 1
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
   * Searches for matching movies using vector similarity
   * @param {number[]} embedding - Query embedding vector
   * @returns {Promise<Object|null>} Matching movie data or null
   * @throws {Error} If search fails
   */
  async findMatchingMovie(embedding) {
    try {
      const { data, error } = await supabase.rpc('match_movies', {
        query_embedding: embedding,
        match_threshold: CONFIG.API.MATCH_THRESHOLD,
        match_count: CONFIG.API.MATCH_COUNT
      });

      if (error) {
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!data || data.length === 0) {
        return null;
      }

      return data[0];
    } catch (error) {
      console.error('Error finding matching movie:', error);
      throw new Error(`Failed to find matching movie: ${error.message}`);
    }
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
   * Finds a movie recommendation based on user input
   * @param {string} userInput - Combined user input text
   * @returns {Promise<{title: string, description: string}>} Movie recommendation
   */
  async getRecommendation(userInput) {
    const embedding = await this.generateEmbedding(userInput);
    const match = await this.findMatchingMovie(embedding);

    if (!match) {
      return {
        title: CONFIG.MESSAGES.NO_MATCH.TITLE,
        description: CONFIG.MESSAGES.NO_MATCH.DESCRIPTION
      };
    }

    return this.parseMovieContent(match.content);
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
      
      // Show results screen immediately for better UX
      this.ui.showScreen(2);
      this.ui.showLoading();

      // Fetch and display recommendation
      const recommendation = await this.movieService.getRecommendation(userInput);
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
