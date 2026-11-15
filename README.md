# Training Arc

A home-workout web app with an anime twist. Install it from Chrome onto your phone, laptop or TV.

**Open it:** https://billy-m-16.github.io/Training-Arc-Workout-App/

## Features
- 66 workouts across upper, lower, full body, core, cardio, and stretch/mobility, from 10 to 45 minutes and levels 1 to 5
- Formats: supersets, intervals, Tabata, EMOM, AMRAP, ladders, pyramids, chippers, rounds for time, and flows
- Max two pieces of equipment per workout, and only the kit you own
- Quiet mode for indoors, with automatic swaps for jumps, slams and throws
- Weekly check-in: mark injuries (niggle, go easy, off-limits) and exercises are swapped to safe alternatives
- Training arcs of 1–8 weeks with an ease-in, deload weeks, recovery days and boss-fight benchmarks
- Player: big timers, beeps, voice cues, tap anywhere to mark a round done, pause, and the screen stays on
- Ratings and weight logging that shape future picks and suggested weights
- XP, ranks (E to S), squads, and weekly, monthly and all-time leaderboards
- Add your own workouts: build one, paste one from a website and pick a timer, or import workout code

## Tech
Plain HTML, CSS and JavaScript modules: no build step. It is hosted on GitHub Pages, with Firebase Auth and Firestore for sync and squads. `firestore.rules` holds the database security rules, which are pasted into the Firebase console.

## Adding workouts as code
Workouts live in `js/data/workouts.js`, and exercises in `js/data/exercises.js`. The block format is documented at the top of `workouts.js`. The same JSON can be pasted into **Add a workout → Import code** in the app.
