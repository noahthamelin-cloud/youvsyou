/* ============================================================
   You vs You - PPL 8-Day Rotation
   Six lifting days, two recovery days, repeating forever.
   Days 1-3 are strength emphasis (heavier, lower reps).
   Days 5-7 are hypertrophy emphasis (controlled, higher reps).
   Days 4 and 8 are recovery and route to timed circuits.

   `name` must match program-data.js exactly where a lift already has
   history, so the work-to-beat carries over instead of resetting.
   ============================================================ */

window.PPL_PROGRAM = {
  id: 'ppl',
  title: 'PPL 8-Day Rotation',
  short: 'PPL',
  blurb: 'Six lifting days, two recovery days. A days are strength, B days are growth.',
  cycleLength: 8,
  days: [
    {
      n: 1, name: 'Push A', focus: 'Chest strength', emphasis: 'strength',
      priority: 'Heavy bench, upper chest, shoulders and triceps.',
      exercises: [
        { group:'A1', name:'Barbell bench press',          sets:4, targetReps:'4-6'   },
        { group:'A2', name:'Incline DB chest press',       sets:3, targetReps:'6-10'  },
        { group:'A3', name:'Machine Shoulder Press',       sets:3, targetReps:'6-10'  },
        { group:'A4', name:'Pec Deck',                     sets:2, targetReps:'10-15' },
        { group:'A5', name:'DB Lateral Raise',             sets:3, targetReps:'12-20' },
        { group:'A6', name:'Cable Tricep Pressdown',       sets:3, targetReps:'10-15' },
        { group:'A7', name:'Overhead Cable Tricep Ext',    sets:2, targetReps:'10-15' }
      ]
    },
    {
      n: 2, name: 'Pull A', focus: 'Back strength', emphasis: 'strength',
      priority: 'Back thickness, lat strength, rear delts and biceps.',
      exercises: [
        { group:'A1', name:'Chest Supported DB row',       sets:4, targetReps:'6-8'   },
        { group:'A2', name:'Lat Pulldown',                 sets:3, targetReps:'6-10'  },
        { group:'A3', name:'Seated Cable Row',             sets:3, targetReps:'8-12'  },
        { group:'A4', name:'Rear Delt Fly Machine',        sets:3, targetReps:'12-15' },
        { group:'A5', name:'Incline DB curls',             sets:3, targetReps:'8-12'  },
        { group:'A6', name:'Hammer Curls',                 sets:3, targetReps:'10-12' }
      ]
    },
    {
      n: 3, name: 'Legs A', focus: 'Squat strength', emphasis: 'strength',
      priority: 'Quads, glutes, hamstrings and lower body strength.',
      exercises: [
        { group:'A1', name:'Back Squat',                   sets:4, targetReps:'4-6'   },
        { group:'A2', name:'Leg Press',                    sets:3, targetReps:'8-12'  },
        { group:'A3', name:'Laying Hamstring Curls',       sets:3, targetReps:'8-12'  },
        { group:'A4', name:'Bulgarian split squat',        sets:2, targetReps:'8-10'  },
        { group:'A5', name:'Hip Adductor Machine',         sets:2, targetReps:'12-15' },
        { group:'A6', name:'Standing Calf Raise',          sets:3, targetReps:'10-15' }
      ]
    },
    {
      n: 4, name: 'Recovery', focus: 'Core + mobility', emphasis: 'recovery',
      priority: 'Deliberately gentle after Legs A. Optional if you need real rest.',
      circuit: 'mobility',
      cardio: { label:'Incline walk or easy cycling', mins:'20-30' },
      exercises: []
    },
    {
      n: 5, name: 'Push B', focus: 'Muscle growth', emphasis: 'hypertrophy',
      priority: 'Upper chest, shoulder width and triceps size.',
      exercises: [
        { group:'B1', name:'Incline DB chest press',       sets:3, targetReps:'8-12'  },
        { group:'B2', name:'Machine Chest Press',          sets:3, targetReps:'10-12' },
        { group:'B3', name:'Cable Machine Fly',            sets:2, targetReps:'12-15' },
        { group:'B4', name:'DB Shoulder Press',            sets:2, targetReps:'8-12'  },
        { group:'B5', name:'Cable Lateral Raise',          sets:3, targetReps:'12-20' },
        { group:'B6', name:'Overhead Tricep Extensions',   sets:3, targetReps:'10-15' },
        { group:'B7', name:'Rope Tricep Pressdown',        sets:2, targetReps:'12-15' }
      ]
    },
    {
      n: 6, name: 'Pull B', focus: 'Muscle growth', emphasis: 'hypertrophy',
      priority: 'Lat width, upper back development and fuller biceps.',
      exercises: [
        { group:'B1', name:'Neutral Grip Lat Pulldown',    sets:3, targetReps:'10-12' },
        { group:'B2', name:'Single Arm Seated Cable Rows', sets:3, targetReps:'10-12' },
        { group:'B3', name:'Straight Arm Cable Pulldown',  sets:2, targetReps:'12-15' },
        { group:'B4', name:'Rear Delt Fly Machine',        sets:3, targetReps:'12-20' },
        { group:'B5', name:'Preacher Curl Machine',        sets:3, targetReps:'10-12' },
        { group:'B6', name:'Cable Hammer Curl',            sets:2, targetReps:'12-15' },
        { group:'B7', name:'45-Degree Back Extension',     sets:2, targetReps:'12-15' }
      ]
    },
    {
      n: 7, name: 'Legs B', focus: 'Glutes + hamstrings', emphasis: 'hypertrophy',
      priority: 'Posterior chain, glutes, hamstrings and complete leg development.',
      exercises: [
        { group:'B1', name:'RDL',                          sets:3, targetReps:'8-10'  },
        { group:'B2', name:'Barbell Hip Thrust',           sets:3, targetReps:'8-12'  },
        { group:'B3', name:'Hack Squat',                   sets:3, targetReps:'10-15' },
        { group:'B4', name:'Hamstring Curls',              sets:3, targetReps:'10-15' },
        { group:'B5', name:'Hip Abductor Machine',         sets:3, targetReps:'12-20' },
        { group:'B6', name:'Leg Extensions',               sets:2, targetReps:'12-15' },
        { group:'B7', name:'Seated Calf Raise',            sets:3, targetReps:'12-20' }
      ]
    },
    {
      n: 8, name: 'Recovery', focus: 'Posterior chain + cardio', emphasis: 'recovery',
      priority: 'Positional endurance, not a third leg day. Optional if you need real rest.',
      circuit: 'endurance',
      cardio: { label:'Walking, cycling or elliptical', mins:'25-35' },
      exercises: []
    }
  ]
};
