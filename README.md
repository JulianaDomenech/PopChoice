# PopChoice - Movie Recommendation App

A modern, interactive web application that helps users discover their next favorite movie through an intuitive question-based interface.

## Features

- **Two-Screen Flow**: Simple navigation between question input and movie recommendation screens
- **Interactive Forms**: Three customizable input fields for personalized movie preferences
- **Responsive Design**: Optimized for desktop, tablet, and mobile devices
- **Modern UI**: Clean design with custom branding and smooth transitions

## Tech Stack

- **HTML5**: Semantic markup
- **CSS3**: Custom properties, Flexbox, responsive design
- **JavaScript (ES6+)**: Module-based architecture
- **Vite**: Fast development server and build tool

## Project Structure

```
PopChoice/
├── index.html          # Main HTML structure
├── index.css           # Stylesheet with CSS custom properties
├── index.js            # Application logic and navigation
├── config.js           # API configuration (OpenAI, Supabase)
├── content.js          # Movie data
├── images/             # Image assets
│   └── PopChoiceBranding.png
└── package.json        # Dependencies and scripts
```

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository or navigate to the project directory
2. Install dependencies:
   ```bash
   npm install
   ```

### Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Build for Production

Create an optimized production build:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Usage

1. **Screen 1 - Questions**: 
   - Answer three questions about your movie preferences
   - Click "Let's Go" to proceed to recommendations

2. **Screen 2 - Recommendations**:
   - View your personalized movie recommendation
   - Click "Go Again" to return to the questions screen

## Design System

### Colors
- Background: `#000C36` (Dark Navy)
- Input Background: `#3B4877` (Slate Blue)
- Primary Button: `#4CAF50` (Green)
- Text: `#FFFFFF` (White)
- Placeholder: `#aeb3bb` (Light Gray)

### Typography
- Font Family: Inter (with system font fallbacks)
- Weights: 300, 400, 500, 600, 700

## Code Architecture

### JavaScript
- **Constants**: Centralized configuration for IDs and screen management
- **Modular Functions**: Separated concerns for navigation, form handling, and initialization
- **Event-Driven**: Clean event listener setup with proper initialization

### CSS
- **CSS Custom Properties**: Design tokens for maintainable theming
- **BEM-like Naming**: Clear, semantic class names
- **Mobile-First**: Responsive breakpoints at 768px and 480px

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## License

This project is part of a learning exercise.

## Contributing

This is a personal project. For questions or suggestions, please open an issue.
