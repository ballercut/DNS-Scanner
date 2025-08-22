# Overview

This is a full-stack web application built for domain scanning and analysis. The application scrapes domain data from FreeDNS (freedns.afraid.org) and provides a clean interface for viewing, searching, and managing domain information. It features a React frontend with modern UI components and an Express.js backend with PostgreSQL database storage.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript
- **UI Library**: Radix UI components with shadcn/ui styling system
- **Styling**: Tailwind CSS with CSS variables for theming
- **State Management**: TanStack Query for server state management
- **Routing**: Wouter for client-side routing
- **Build Tool**: Vite with React plugin

## Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Session Management**: In-memory storage with fallback to database sessions
- **API Design**: RESTful endpoints with JSON responses
- **Web Scraping**: Cheerio for HTML parsing of FreeDNS domain registry

## Data Storage
- **ORM**: Drizzle with PostgreSQL dialect
- **Schema**: Two main entities - users and domain_scans
- **Storage Pattern**: Dual storage approach with in-memory cache and persistent database
- **Database Provider**: Neon Database (@neondatabase/serverless)

## Key Features
- **Domain Scanning**: Automated scraping of FreeDNS domain registry
- **Search & Filter**: Real-time domain searching with sorting capabilities
- **Data Export**: CSV download functionality for domain lists
- **Responsive Design**: Mobile-first approach with adaptive UI components

## Development Setup
- **Monorepo Structure**: Shared types and schemas between client/server
- **Hot Reload**: Vite development server with HMR
- **TypeScript**: Strict type checking across the entire codebase
- **Path Aliases**: Configured for clean imports (@/, @shared/)

# External Dependencies

## Database Services
- **Neon Database**: Serverless PostgreSQL hosting
- **Drizzle Kit**: Database migrations and schema management

## UI Dependencies
- **Radix UI**: Accessible component primitives for React
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library for UI components
- **shadcn/ui**: Pre-built component system with design tokens

## Development Tools
- **Vite**: Frontend build tool and development server
- **ESBuild**: Fast JavaScript bundler for production builds
- **TypeScript**: Static type checking and compilation
- **Replit Plugins**: Development environment integration

## Web Scraping
- **Axios**: HTTP client for making requests to FreeDNS
- **Cheerio**: Server-side DOM manipulation and parsing

## State Management
- **TanStack Query**: Server state management with caching
- **React Hook Form**: Form state management with validation resolvers