## Project URL

[insights-eight-phi.vercel.app](https://insights-eight-phi.vercel.app)

## What I built versus the AI

This was a very quick turnaround so I handled the big stuff/polishing while AI handled the bulk of the implementation.

### What I built

- I decided which features to build such as the scent profile and the bird profile
- I chose the data sources after doing some research, specifically wanting US census data after
  seeing a few similar websites employing that dataset
- The tech stack was my decision as I just went with what I'm most familiar with (Next.js +
  TypeScript, TailwindCSS, Vitest, Zod, pnpm, etc.)
- The hero artwork, which I generated separately with nanobanana
- All the animations, color scheme, and layout is my taste

### What the AI drove

- All implementation, including the scoring heuristics and their calibration
- The entire testing suite (230 tests)
- First pass at UI and design
- The backend API routes and database config

## My approach

First thing I did was start looking around the internet to see what already exists to get some
inspiration and see what other fun categories I could add. I was looking for: UI design, databases
uses, site interaction method (input boxes, user drawn circles, etc.), local storage usage, and
general complexity. From there, I created the repo on Github and started a new project on VS Code
with claude skills/commands taken from another project. I had a 10 minute back and forth
conversation with Claude to create a plan for the build and then set it working. While Claude built
the initial design, I generated photos for the hero and set up the Vercel project.

Once the first build was done, I did a lot of UI cleanup, added a few small tasks and had a good hour or two of testing and bug fixes. Finished by tightening up the UI and theme, making sure the CI pipeline was working, and verifying everything shipped cleanly to Vercel.

## Assumptions/design decisions

### Assumptions

- Since this was such a quick project, I didn't set up a Supabase or formal backend which would've
  reduced latency significantly but I didn't have the time to ingest all the data
- This is a US specific project. Anything outside of the states comes up with an error message
- This is a desktop version. I decided to still make it mobile responsive for completion's sake

### Design decisions

I really love to play Wordle and all its variants so that was the inspiration for the theme. I also
wanted to have a clean landing page and then a separate generation/insights page. Simple is usually
best so I tried not to leave too many things crowding the page.
I wanted to use TinyURL but I just couldn't get it to work in the timeframe and it's not the biggest deal. Definitely something I would implement in the next version.
