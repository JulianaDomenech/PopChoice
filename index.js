/**
 * PopChoice - Movie Recommendation App
 * Main application logic for screen navigation and form handling
 */

// Constants
const SCREEN_IDS = {
    QUESTIONS: 'screen1',
    RESULTS: 'screen2'
};

const INPUT_IDS = {
    FAVORITE_MOVIE: 'favoriteMovieInput',
    MOOD: 'moodInput',
    FUN: 'funInput'
};

const BUTTON_IDS = {
    LETS_GO: 'letsGoButton',
    GO_AGAIN: 'goAgainButton'
};

// DOM Elements
const screen1 = document.getElementById(SCREEN_IDS.QUESTIONS);
const screen2 = document.getElementById(SCREEN_IDS.RESULTS);

/**
 * Shows the specified screen and hides all others
 * @param {number} screenNumber - The screen number to display (1 or 2)
 */
function showScreen(screenNumber) {
    // Hide all screens
    screen1.classList.remove('active');
    screen2.classList.remove('active');
    
    // Show the requested screen
    if (screenNumber === 1) {
        screen1.classList.add('active');
        resetForm();
    } else if (screenNumber === 2) {
        screen2.classList.add('active');
    }
}

/**
 * Resets all form inputs on the questions screen
 */
function resetForm() {
    const inputs = [
        document.getElementById(INPUT_IDS.FAVORITE_MOVIE),
        document.getElementById(INPUT_IDS.MOOD),
        document.getElementById(INPUT_IDS.FUN)
    ];

    inputs.forEach(input => {
        if (input) {
            input.value = '';
        }
    });
}

/**
 * Initializes event listeners for navigation buttons
 */
function initializeNavigation() {
    const letsGoButton = document.getElementById(BUTTON_IDS.LETS_GO);
    const goAgainButton = document.getElementById(BUTTON_IDS.GO_AGAIN);
    
    if (letsGoButton) {
        letsGoButton.addEventListener('click', () => showScreen(2));
    }
    
    if (goAgainButton) {
        goAgainButton.addEventListener('click', () => showScreen(1));
    }
}

/**
 * Initialize the application when DOM is ready
 */
function init() {
    initializeNavigation();
    showScreen(1);
}

// Start the application when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Export for potential future use
export { showScreen };
