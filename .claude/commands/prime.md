---
description: Prime agent with codebase understanding
---

# Prime: Load Project Context

## Objective

Build comprehensive understanding of the codebase by analyzing structure, documentation, and key files.

## Process

### 1. Analyze Project Structure

List all tracked files:
!`git ls-files`

Show directory structure:
On Linux, run: `tree -L 3 -I 'node_modules|__pycache__|.git|dist|build'`

### 2. Read Core Documentation

- Read the PRD.md or similar spec file
- Read CLAUDE.md or similar global rules file
- Read the 10 most recent entries to the CHANGELOG.md file
- Read README files at project root and major directories
- Read any architecture documentation
- Read the .agents folder files
- Read the skills subfolder
- Read the drizzle config so you understand the database schema

### 3. Identify Key Files

Based on the structure, identify and read:

- Main entry points (main.py, index.ts, app.py, etc.)
- Core configuration files (pyproject.toml, package.json, tsconfig.json)
- Key model/schema definitions
- Important service or controller files

### 4. Understand Current State

Check recent activity:
!`git log -10 --oneline`

Check current branch and status:
!`git status`

## Output Report

Provide a concise summary covering:

### Project Overview

- Purpose and type of application
- Primary technologies and frameworks
- Current version/state

### Architecture

- Overall structure and organization
- Key architectural patterns identified
- Important directories and their purposes

### Tech Stack

- Languages and versions
- Frameworks and major libraries
- Build tools and package managers
- Testing frameworks

### Core Principles

- Code style and conventions observed
- Documentation standards
- Testing approach

### Current State

- Active branch
- Recent changes or development focus
- Any immediate observations or concerns

**Make this summary easy to scan - use bullet points and clear headers.**

### Branch Check (always end with this)

End the report by clearly stating, on its own line, the branch we are currently on (e.g. **"You are on branch `chore/release-v0.1.1`."**). Then ask whether we want to keep working on this branch or move to a new one before starting work, noting that `main` is never a direct-commit target. Wait for the answer before making any changes.
