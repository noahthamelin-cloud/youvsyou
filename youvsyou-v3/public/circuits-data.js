/* ============================================================
   You vs You - Timed Circuits
   Guided, hands-free routines. The app counts down each movement,
   buzzes, and moves you to the next one.

   `img` is the filename stem in images/core/. The app looks for
   images/core/<img>.png and silently falls back to a clean text-only
   card if the file is not there, so routines work before the art lands.

   rounds   - how many times the movement list repeats
   finisher - runs once at the very end, after all rounds
   side     - true means the movement runs twice, left then right
   ============================================================ */

window.CIRCUITS = {

  core: {
    id: 'core',
    title: 'Daily Core',
    blurb: 'Bodyweight core routine you can run every day or every couple of days. No equipment, about 12 minutes.',
    rounds: 1,
    rest: 15,
    movements: [
      { img:'dead-bug', name:'Dead Bug', target:'Deep core', sec:45,
        cue:'Low back pressed flat into the floor. Opposite arm and leg reach away slowly, ribs stay down.' },
      { img:'forearm-plank', name:'Forearm Plank', target:'Deep core', sec:45,
        cue:'Elbows under shoulders, tail tucked, glutes squeezed. One straight line from heels to head.' },
      { img:'bird-dog', name:'Bird Dog', target:'Core and glutes', sec:45,
        cue:'Opposite arm and leg, reach long rather than high. Hips stay square to the floor, no rocking.' },
      { img:'side-plank', name:'Side Plank', target:'Obliques', sec:30, side:true,
        cue:'Stack the shoulders and hips. Push the floor away and lift the bottom ribs, do not sag.' },
      { img:'hollow-hold', name:'Hollow Hold', target:'Lower abs', sec:30,
        cue:'Low back glued down. Lower the arms and legs only as far as you can keep it there.' },
      { img:'glute-bridge-hold', name:'Glute Bridge Hold', target:'Glutes', sec:45,
        cue:'Drive through the heels, squeeze the glutes hard, ribs down. Hips level the whole time.' },
      { img:'bicycle-crunch', name:'Bicycle Crunch', target:'Obliques', sec:45,
        cue:'Slow and deliberate. Turn from the ribs, not the elbows. Opposite elbow travels toward the knee.' },
      { img:'leg-lowers', name:'Leg Lowers', target:'Lower abs', sec:40,
        cue:'Hands under the hips if needed. Lower until the back wants to arch, then come back up.' },
      { img:'plank-shoulder-tap', name:'Plank Shoulder Taps', target:'Deep core', sec:40,
        cue:'Feet wide for balance. Tap the opposite shoulder without letting the hips rotate at all.' },
      { img:'mountain-climber', name:'Mountain Climbers', target:'Core', sec:40,
        cue:'Hips low and level. Drive the knee in under control, do not bounce the hips up and down.' },
      { img:'russian-twist', name:'Russian Twist', target:'Obliques', sec:40,
        cue:'Chest tall, lean back to where you feel the core switch on. Rotate the ribcage, not just the arms.' }
    ],
    finisher: [
      { img:'breathing', name:'Diaphragmatic Breathing', target:'Downregulate', sec:60,
        cue:'Lie back, knees bent. Breathe into the belly and the sides of the ribs. Long, slow exhale.' }
    ]
  },

  mobility: {
    id: 'mobility',
    title: 'Day 4: Core + Mobility',
    blurb: 'The gentle recovery day after Legs A. Two rounds, about 14 minutes. Optional if your legs need real rest.',
    rounds: 2,
    rest: 15,
    movements: [
      { img:'dead-bug', name:'Dead Bug', target:'Deep core', sec:40,
        cue:'Around 10 per side. Low back flat, slow reach, ribs down the whole time.' },
      { img:'side-plank', name:'Side Plank', target:'Obliques', sec:30, side:true,
        cue:'Stack shoulders over elbow and hips over hips. Lift through the bottom ribs.' },
      { img:'bird-dog', name:'Bird Dog', target:'Core and glutes', sec:40,
        cue:'Around 10 per side. Reach long, keep the hips square, pause for a beat at full extension.' },
      { img:'adductor-rock-back', name:'Adductor Rock Back', target:'Inner thigh', sec:40, side:true,
        cue:'One leg out to the side, foot flat. Rock the hips back until the inner thigh lengthens, then return.' },
      { img:'hip-90-90', name:'90/90 Hip Rotation', target:'Hips', sec:40, side:true,
        cue:'Both knees at ninety degrees. Rotate the knees to the floor on one side under control, no hands.' }
    ],
    finisher: []
  },

  endurance: {
    id: 'endurance',
    title: 'Day 8: Positional Endurance',
    blurb: 'Hip control, pelvic stability and holding positions without fatiguing. Two rounds plus breathing, about 15 minutes.',
    rounds: 2,
    rest: 15,
    movements: [
      { img:'forearm-plank', name:'Forearm Plank', target:'Deep core', sec:40,
        cue:'Tail tucked, glutes on, breathing normally. Quality of position beats extra seconds.' },
      { img:'high-plank-shift', name:'High Plank Weight Shift', target:'Core and shoulders', sec:30,
        cue:'Arms straight. Shift the weight forward and side to side while the hips stay completely still.' },
      { img:'glute-bridge-hold', name:'Glute Bridge Hold', target:'Glutes', sec:40,
        cue:'Heels close, shins vertical. Squeeze hard at the top and hold without arching the low back.' },
      { img:'glute-bridge-reps', name:'Glute Bridge Reps', target:'Glutes', sec:40,
        cue:'Around 15 controlled reps. Full squeeze at the top, lower under control, no bouncing.' },
      { img:'copenhagen-hold', name:'Short Lever Copenhagen', target:'Adductors', sec:20, side:true,
        cue:'Top knee on the bench, forearm down. Lift the hips and hold. Short lever, keep it conservative.' },
      { img:'hip-flexor-march', name:'Standing Hip Flexor March', target:'Hip flexors', sec:40,
        cue:'Around 12 per side. Stand tall, drive one knee to hip height and hold a beat before switching.' }
    ],
    finisher: [
      { img:'breathing', name:'Relaxed Diaphragmatic Breathing', target:'Downregulate', sec:120,
        cue:'Belly and ribs expand on the inhale, long slow exhale. The goal is relaxing, not squeezing harder.' }
    ]
  }

};
