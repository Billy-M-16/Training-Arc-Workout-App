// Exercise library.
// Row format: [id, name, equipment[], pattern, stress, flags, unit, cue]
//  equipment ids: bw kb db bb sbb ez band mb rope run box bench pullup rower bike
//  stress: letters + level 1-3  (b back, n neck, s shoulder, e elbow, w wrist, h hip, k knee, a ankle)
//  flags: L loud (jumping / slamming / throwing), O outdoor-ish, U unilateral (reps are per side)
//  unit: r reps, s seconds, m metres

const RAW = [
  // ---------- Bodyweight: lower ----------
  ['air_squat', 'Air squat', ['bw'], 'squat', 'k1 h1', '', 'r', 'Chest up, hips back and down, drive through the whole foot.'],
  ['jump_squat', 'Jump squat', ['bw'], 'squat', 'k3 a2', 'L', 'r', 'Quarter-squat load, explode up, land soft and quiet.'],
  ['reverse_lunge', 'Reverse lunge', ['bw'], 'lunge', 'k2 h1', '', 'r', 'Step back, back knee kisses the floor, front shin vertical. Reps are total.'],
  ['split_squat', 'Split squat', ['bw'], 'lunge', 'k2 h1', 'U', 'r', 'Feet fixed, drop straight down, torso tall.'],
  ['jump_lunge', 'Jumping lunge', ['bw'], 'lunge', 'k3 a3', 'L', 'r', 'Switch legs mid-air, land balanced. Reps are total.'],
  ['glute_bridge', 'Glute bridge', ['bw'], 'hinge', 'h1', '', 'r', 'Ribs down, squeeze glutes hard at the top, pause one second.'],
  ['single_leg_bridge', 'Single-leg glute bridge', ['bw'], 'hinge', 'h1', 'U', 'r', 'Keep hips level, push through the heel.'],
  ['wall_sit', 'Wall sit', ['bw'], 'squat', 'k2', '', 's', 'Thighs parallel, back flat on the wall, breathe.'],
  ['calf_raise', 'Calf raise', ['bw'], 'squat', 'a1', '', 'r', 'Full range, pause at the top, slow down.'],
  ['skater', 'Skater hop', ['bw'], 'cardio', 'k2 a2', 'L', 'r', 'Bound side to side, stick each landing. Reps are total.'],
  ['lateral_lunge', 'Lateral lunge', ['bw'], 'lunge', 'k2 h2', '', 'r', 'Sit back into one hip, other leg straight. Reps are total.'],

  // ---------- Bodyweight: upper ----------
  ['pushup', 'Push-up', ['bw'], 'push_h', 's2 w2 e1', '', 'r', 'Body in one line, chest to fist height, elbows at 45°.'],
  ['knee_pushup', 'Knee push-up', ['bw'], 'push_h', 's1 w2', '', 'r', 'Hips in line with shoulders and knees, full range.'],
  ['pike_pushup', 'Pike push-up', ['bw'], 'push_v', 's3 w2 n1', '', 'r', 'Hips high, head travels in front of the hands.'],
  ['plank_shoulder_tap', 'Plank shoulder tap', ['bw'], 'core', 's1 w2', '', 'r', 'Wide feet, hips still, tap opposite shoulder. Reps are total.'],
  ['bear_crawl_hold', 'Bear plank hold', ['bw'], 'core', 's1 w2', '', 's', 'Knees hover 2 cm off the floor, back flat.'],

  // ---------- Bodyweight: core ----------
  ['plank', 'Plank', ['bw'], 'core', 'b1 s1', '', 's', 'Squeeze glutes, ribs down, push the floor away.'],
  ['side_plank', 'Side plank', ['bw'], 'core', 's1', '', 's', 'Stack hips, straight line head to heel. Switch sides halfway.'],
  ['dead_bug', 'Dead bug', ['bw'], 'core', '', '', 'r', 'Low back pressed into the floor, slow opposite arm and leg. Reps are total.'],
  ['bird_dog', 'Bird dog', ['bw'], 'core', '', '', 'r', 'Reach long, hips square, pause at full extension. Reps are total.'],
  ['hollow_hold', 'Hollow hold', ['bw'], 'core', 'b2', '', 's', 'Low back glued down. Bend knees if the back lifts.'],
  ['superman', 'Superman hold', ['bw'], 'core', 'b1 n1', '', 's', 'Lift chest and legs gently, long neck, squeeze glutes.'],
  ['russian_twist', 'Russian twist', ['bw'], 'core_rot', 'b2', '', 'r', 'Lean back tall, rotate from the ribs. Reps are total.'],
  ['v_up', 'V-up', ['bw'], 'core', 'b2 h1', '', 'r', 'Reach hands to toes, control the way down.'],
  ['tuck_up', 'Tuck-up', ['bw'], 'core', 'b1 h1', '', 'r', 'Knees to chest, shoulders off the floor.'],
  ['flutter_kick', 'Flutter kicks', ['bw'], 'core', 'b2 h1', '', 's', 'Small fast kicks, low back stays down.'],
  ['leg_raise', 'Lying leg raise', ['bw'], 'core', 'b2 h1', '', 'r', 'Hands under hips, lower slowly.'],
  ['reverse_crunch', 'Reverse crunch', ['bw'], 'core', 'b1', '', 'r', 'Curl hips off the floor, slow down.'],
  ['crunch', 'Crunch', ['bw'], 'core', 'n1', '', 'r', 'Ribs to hips, chin tucked, short range.'],
  ['situp', 'Sit-up', ['bw'], 'core', 'b2 h1', '', 'r', 'Feet anchored or butterfly, touch the floor behind and in front.'],

  // ---------- Bodyweight: cardio ----------
  ['burpee', 'Burpee', ['bw'], 'cardio', 'k2 w2 b2 s2', 'L', 'r', 'Chest to floor, jump and clap overhead.'],
  ['burpee_no_jump', 'Step-back burpee', ['bw'], 'cardio', 'w2 s1', '', 'r', 'Step back to plank, step in, stand tall. No jump, no noise.'],
  ['mountain_climber', 'Mountain climber', ['bw'], 'cardio', 'w2 s1 h1', '', 'r', 'Hips level, knees drive to chest. Reps are total.'],
  ['high_knees', 'High knees', ['bw'], 'cardio', 'k2 a2', 'L', 's', 'Fast feet, knees to hip height, pump the arms.'],
  ['jumping_jack', 'Jumping jack', ['bw'], 'cardio', 'a2', 'L', 's', 'Light on the toes, full arm swing.'],
  ['fast_feet', 'Fast feet', ['bw'], 'cardio_low', 'a1', '', 's', 'Quick light steps on the spot, stay low and quiet.'],
  ['march', 'Marching high knees', ['bw'], 'cardio_low', '', '', 's', 'Big arm swing, knees up, quiet feet.'],
  ['shadow_boxing', 'Shadow boxing', ['bw'], 'cardio_low', 's1', '', 's', 'Stay on the balls of your feet, jab-cross-hook, keep the hands up.'],
  ['squat_reach', 'Squat to reach', ['bw'], 'cardio_low', 'k1', '', 's', 'Squat, then stand and reach high onto your toes.'],
  ['run', 'Run', ['run'], 'cardio', 'k2 a2', 'O', 'm', 'Relaxed shoulders, quick cadence.'],
  ['run_time', 'Run (hard)', ['run'], 'cardio', 'k2 a2', 'O', 's', 'Hard but repeatable pace for every interval.'],
  ['jog', 'Easy jog', ['run'], 'cardio_low', 'k1 a1', 'O', 's', 'Conversation pace. Nose-breathing if you can.'],
  ['walk_brisk', 'Brisk walk', ['bw'], 'cardio_low', '', 'O', 's', 'Walk with purpose, arms swinging.'],
  ['walk_easy', 'Easy walk', ['bw'], 'cardio_low', '', 'O', 's', 'Relaxed walk. Breathe and loosen up.'],

  // ---------- Mobility & stretching ----------
  ['arm_circles', 'Arm circles', ['bw'], 'mobility', '', '', 's', 'Small to big, both directions.'],
  ['leg_swings', 'Leg swings', ['bw'], 'mobility', '', '', 's', 'Front-back then side-side, hold something for balance.'],
  ['inchworm', 'Inchworm', ['bw'], 'mobility', 'w1 b1', '', 's', 'Walk hands out to plank, walk feet in, soft knees.'],
  ['worlds_greatest', "World's greatest stretch", ['bw'], 'mobility', '', '', 's', 'Lunge, elbow to instep, rotate and reach up. Alternate sides.'],
  ['cat_cow', 'Cat-cow', ['bw'], 'mobility', '', '', 's', 'Move slowly, one vertebra at a time, breathe with it.'],
  ['hip_90_90', '90/90 hip switch', ['bw'], 'mobility', 'h1', '', 's', 'Sit tall, rotate knees side to side.'],
  ['couch_stretch', 'Couch stretch', ['bw'], 'mobility', 'k1', '', 's', 'Back knee against a wall, squeeze glute. Switch sides halfway.'],
  ['pigeon', 'Pigeon stretch', ['bw'], 'mobility', 'k1 h1', '', 's', 'Square hips, fold forward. Switch sides halfway.'],
  ['figure_four', 'Figure-4 stretch (on back)', ['bw'], 'mobility', '', '', 's', 'Ankle over knee, pull the thigh in. Switch sides halfway.'],
  ['open_book', 'Open book rotation', ['bw'], 'mobility', '', '', 's', 'Side-lying, knees stacked, open the top arm. Switch sides halfway.'],
  ['thread_needle', 'Thread the needle', ['bw'], 'mobility', '', '', 's', 'On all fours, slide one arm under and rotate. Alternate.'],
  ['childs_pose', "Child's pose", ['bw'], 'mobility', '', '', 's', 'Sink hips to heels, long arms, slow breaths.'],
  ['deep_squat_hold', 'Deep squat hold', ['bw'], 'mobility', 'k1', '', 's', 'Heels down, elbows push knees out, chest proud.'],
  ['down_dog', 'Downward dog', ['bw'], 'mobility', 'w1', '', 's', 'Push hips up and back, pedal the heels.'],
  ['sphinx', 'Sphinx / cobra', ['bw'], 'mobility', '', '', 's', 'Gentle extension for the low back. Relax the glutes.'],
  ['knee_to_chest', 'Knees to chest', ['bw'], 'mobility', '', '', 's', 'Hug knees in, rock gently side to side.'],
  ['pelvic_tilt', 'Pelvic tilts', ['bw'], 'mobility', '', '', 's', 'On your back, flatten then arch the low back gently.'],
  ['hamstring_stretch', 'Hamstring stretch', ['bw'], 'mobility', '', '', 's', 'Hinge at the hips with a long spine. Switch sides halfway.'],
  ['doorway_pec', 'Doorway chest stretch', ['bw'], 'mobility', 's1', '', 's', 'Forearm on the frame, step through gently.'],
  ['lat_stretch', 'Lat stretch', ['bw'], 'mobility', '', '', 's', 'Hands on a bench or wall, sink the chest. Switch sides halfway.'],
  ['neck_stretch', 'Neck side stretch', ['bw'], 'mobility', '', '', 's', 'Ear to shoulder, gentle hand assist. Alternate.'],
  ['shoulder_cars', 'Shoulder CARs', ['bw'], 'mobility', '', '', 's', 'Slow, biggest circle you can control. Alternate arms.'],
  ['hip_cars', 'Hip CARs', ['bw'], 'mobility', '', '', 's', 'Hold a wall, draw the biggest circle with your knee. Alternate.'],
  ['ankle_rocks', 'Ankle rocks', ['bw'], 'mobility', '', '', 's', 'Half kneel, drive the knee over the toes. Alternate.'],
  ['frog_stretch', 'Frog stretch', ['bw'], 'mobility', 'h1', '', 's', 'Knees wide, rock hips back slowly.'],
  ['quad_stretch', 'Standing quad stretch', ['bw'], 'mobility', '', '', 's', 'Heel to glute, knees together. Switch sides halfway.'],
  ['calf_stretch', 'Calf stretch', ['bw'], 'mobility', '', '', 's', 'Hands on the wall, back heel down. Switch sides halfway.'],
  ['breathing', 'Box breathing', ['bw'], 'mobility', '', '', 's', 'In 4, hold 4, out 4, hold 4. Lying down.'],

  // ---------- Kettlebell ----------
  ['kb_swing', 'Kettlebell swing', ['kb'], 'power', 'b2 h1 s1', '', 'r', 'Hike, snap the hips, bell floats to chest height.'],
  ['kb_goblet_squat', 'Goblet squat (KB)', ['kb'], 'squat', 'k2 b1', '', 'r', 'Bell at chest, elbows inside knees at the bottom.'],
  ['kb_deadlift', 'Kettlebell deadlift', ['kb'], 'hinge', 'b2', '', 'r', 'Bell between the feet, hips back, flat back, stand tall.'],
  ['kb_sumo_high_pull', 'KB sumo deadlift high pull', ['kb'], 'power', 'b2 s2', '', 'r', 'Wide stance, drive up, elbows high.'],
  ['kb_clean', 'Kettlebell clean', ['kb'], 'power', 's1 w1 b2', 'U', 'r', 'Zip it up close, soft catch in the rack.'],
  ['kb_press', 'Kettlebell press', ['kb'], 'push_v', 's2', 'U', 'r', 'Squeeze glutes, press straight up, bicep by the ear.'],
  ['kb_push_press', 'Kettlebell push press', ['kb'], 'push_v', 's2 k1', 'U', 'r', 'Dip and drive with the legs, lock out overhead.'],
  ['kb_snatch', 'Kettlebell snatch', ['kb'], 'power', 's3 b2 w1', 'U', 'r', 'Swing, high pull, punch through to lockout.'],
  ['kb_row', 'Kettlebell bent-over row', ['kb'], 'pull', 'b2', 'U', 'r', 'Hinge, flat back, pull to the hip pocket.'],
  ['kb_gorilla_row', 'KB gorilla row', ['kb'], 'pull', 'b2', '', 'r', 'Wide stance, alternate arms. Reps are total.'],
  ['kb_halo', 'Kettlebell halo', ['kb'], 'mobility', 's1 n1', '', 'r', 'Circle the bell around the head, ribs down. Reps are total.'],
  ['kb_around_world', 'KB around the world', ['kb'], 'core', '', '', 'r', 'Pass around the waist, hips still. Reps are total.'],
  ['kb_tgu', 'Turkish get-up', ['kb'], 'core', 's2 h1', 'U', 'r', 'Eyes on the bell, slow and deliberate.'],
  ['kb_windmill', 'Kettlebell windmill', ['kb'], 'core_rot', 'b2 s2', 'U', 'r', 'Bell overhead, hinge to the side, eyes up.'],
  ['kb_russian_twist', 'KB Russian twist', ['kb'], 'core_rot', 'b2', '', 'r', 'Tall chest, tap side to side. Reps are total.'],
  ['kb_suitcase_march', 'KB suitcase march', ['kb'], 'carry', '', '', 's', 'Bell in one hand, march on the spot, stay level. Switch hands halfway.'],
  ['kb_rack_lunge', 'KB front-rack reverse lunge', ['kb'], 'lunge', 'k2', 'U', 'r', 'Bell racked, step back, stay tall.'],
  ['kb_thruster', 'KB goblet thruster', ['kb'], 'full', 'k2 s2', '', 'r', 'Goblet squat into a press in one smooth drive.'],
  ['kb_floor_press', 'KB floor press', ['kb'], 'push_h', 's1', 'U', 'r', 'Lying down, elbow touches the floor, press up.'],
  ['kb_sl_rdl', 'KB single-leg RDL', ['kb'], 'hinge', 'b1 h1 a1', 'U', 'r', 'Reach the back leg long, hips square.'],
  ['kb_figure8', 'KB figure-8', ['kb'], 'core', 'b1', '', 'r', 'Pass through the legs in a figure-8, hinge position. Reps are total.'],
  ['kb_goblet_hold', 'KB goblet squat hold', ['kb'], 'mobility', 'k1', '', 's', 'Sit deep with the bell as counterweight, pry knees out.'],

  // ---------- Dumbbell ----------
  ['db_goblet_squat', 'Goblet squat (DB)', ['db'], 'squat', 'k2 b1', '', 'r', 'One dumbbell at the chest, sit between the heels.'],
  ['db_thruster', 'Dumbbell thruster', ['db'], 'full', 'k2 s2', '', 'r', 'Front squat into a press, one fluid drive.'],
  ['db_rdl', 'Dumbbell RDL', ['db'], 'hinge', 'b2 h1', '', 'r', 'Soft knees, hips back, bells skim the thighs.'],
  ['db_reverse_lunge', 'DB reverse lunge', ['db'], 'lunge', 'k2', '', 'r', 'Bells at the sides, step back. Reps are total.'],
  ['db_split_squat', 'DB split squat', ['db'], 'lunge', 'k2', 'U', 'r', 'Fixed stance, straight down and up.'],
  ['db_step_up', 'DB step-up', ['db', 'box'], 'lunge', 'k2', 'U', 'r', 'Whole foot on the box, drive through the heel.'],
  ['db_shoulder_press', 'DB shoulder press', ['db'], 'push_v', 's2', '', 'r', 'Ribs down, press to lockout, slow down.'],
  ['db_push_press', 'DB push press', ['db'], 'push_v', 's2 k1', '', 'r', 'Dip-drive, legs do the work, lock out.'],
  ['db_floor_press', 'DB floor press', ['db'], 'push_h', 's1', '', 'r', 'Lying down, elbows touch the floor, press up.'],
  ['db_bench_press', 'DB bench press', ['db', 'bench'], 'push_h', 's2', '', 'r', 'Shoulder blades pinned, control the bells.'],
  ['db_row', 'DB bent-over row', ['db'], 'pull', 'b2', '', 'r', 'Hinge, flat back, pull both bells to the hips.'],
  ['db_chest_row', 'DB chest-supported row', ['db', 'bench'], 'pull', '', '', 'r', 'Chest on an incline bench. Back-friendly.'],
  ['db_renegade_row', 'Renegade row', ['db'], 'pull', 'w2 s2 b1', '', 'r', 'Plank on the bells, row without twisting. Reps are total.'],
  ['db_curl', 'Dumbbell curl', ['db'], 'arms_bi', 'e1', '', 'r', 'Elbows pinned, squeeze at the top.'],
  ['db_hammer_curl', 'Hammer curl', ['db'], 'arms_bi', 'e1', '', 'r', 'Neutral grip, no swinging.'],
  ['db_tricep_ext', 'DB overhead tricep extension', ['db'], 'arms_tri', 'e2 s1', '', 'r', 'One bell, two hands, elbows point forward.'],
  ['db_skullcrusher', 'DB skull crusher (floor)', ['db'], 'arms_tri', 'e2', '', 'r', 'Lying on the floor, lower to the ears, extend.'],
  ['db_lateral_raise', 'Lateral raise', ['db'], 'shoulder_iso', 's1', '', 'r', 'Lead with the elbows, stop at shoulder height.'],
  ['db_front_raise', 'Front raise', ['db'], 'shoulder_iso', 's1', '', 'r', 'Thumbs up, raise to eye level, slow down.'],
  ['db_reverse_fly', 'DB reverse fly', ['db'], 'shoulder_iso', 'b1', '', 'r', 'Hinge, squeeze the shoulder blades, light weight.'],
  ['db_snatch', 'DB snatch', ['db'], 'power', 's2 b2', 'U', 'r', 'From the floor to overhead in one move. Alternate.'],
  ['db_clean_press', 'DB clean and press', ['db'], 'full', 's2 b2', '', 'r', 'Hang clean to the shoulders, press overhead.'],
  ['db_devil_press', 'Devil press', ['db'], 'full', 's2 b2 w2', '', 'r', 'Burpee on the bells, swing them overhead in one go.'],
  ['db_sumo_squat', 'DB sumo squat', ['db'], 'squat', 'k1 h2', '', 'r', 'Wide stance, one bell hanging, sit down between.'],
  ['db_hang_clean', 'DB hang clean', ['db'], 'power', 'b2 w1', '', 'r', 'From the knees, jump and shrug, catch on the shoulders.'],
  ['db_glute_bridge', 'DB glute bridge', ['db'], 'hinge', 'h1', '', 'r', 'Bell on the hips, drive up, pause.'],
  ['db_russian_twist', 'DB Russian twist', ['db'], 'core_rot', 'b2', '', 'r', 'Hold one bell, rotate side to side. Reps are total.'],
  ['db_woodchop', 'DB woodchop', ['db'], 'core_rot', 'b2 s1', '', 'r', 'High to low across the body, pivot the back foot. Reps are total.'],
  ['db_farmer_march', 'DB farmer march', ['db'], 'carry', '', '', 's', 'Heavy bells at the sides, march tall on the spot.'],
  ['db_pullover', 'DB pullover (floor)', ['db'], 'pull', 's2', '', 'r', 'Lying, arms long, take the bell behind the head and back.'],
  ['db_z_press', 'DB Z-press (seated)', ['db'], 'push_v', 's2', '', 'r', 'Sit on the floor, legs straight, press. Core on.'],
  ['db_calf_raise', 'DB calf raise', ['db'], 'squat', 'a1', '', 'r', 'Bells at the sides, full range.'],

  // ---------- Large barbell ----------
  ['bb_deadlift', 'Barbell deadlift', ['bb'], 'hinge', 'b3 h1', '', 'r', 'Bar over mid-foot, brace hard, push the floor away.'],
  ['bb_rdl', 'Barbell RDL', ['bb'], 'hinge', 'b2 h1', '', 'r', 'Soft knees, bar skims the thighs, hips back.'],
  ['bb_front_squat', 'Barbell front squat (clean to rack)', ['bb'], 'squat', 'k2 b2 w1', '', 'r', 'Clean it up, elbows high, sit straight down.'],
  ['bb_back_squat', 'Barbell back squat', ['bb', 'rack'], 'squat', 'k2 b2', '', 'r', 'Brace, sit between the heels, drive up.'],
  ['bb_bent_row', 'Barbell bent-over row', ['bb'], 'pull', 'b3', '', 'r', 'Hinge 45°, flat back, bar to the belly.'],
  ['bb_press', 'Barbell strict press', ['bb'], 'push_v', 's2 b1', '', 'r', 'Glutes on, bar travels close to the face.'],
  ['bb_push_press', 'Barbell push press', ['bb'], 'push_v', 's2 k1 b1', '', 'r', 'Dip and drive, finish with a press.'],
  ['bb_thruster', 'Barbell thruster', ['bb'], 'full', 'k2 s2 b1', '', 'r', 'Front squat straight into a press.'],
  ['bb_hang_clean', 'Barbell hang power clean', ['bb'], 'power', 'b2 w2', '', 'r', 'From the knees, jump, shrug, fast elbows.'],
  ['bb_floor_press', 'Barbell floor press', ['bb'], 'push_h', 's1', '', 'r', 'Lying down, elbows to the floor, press.'],
  ['bb_hip_thrust', 'Barbell glute bridge', ['bb'], 'hinge', 'h1', '', 'r', 'Bar on the hips (pad it), drive up, pause.'],
  ['bb_sumo_high_pull', 'Barbell sumo high pull', ['bb'], 'power', 'b2 s2', '', 'r', 'Wide stance, close grip, elbows high.'],
  ['bb_reverse_lunge', 'Barbell reverse lunge', ['bb', 'rack'], 'lunge', 'k2 b1', '', 'r', 'Bar on the back, step back. Reps are total.'],
  ['bb_bench', 'Barbell bench press', ['bb', 'bench', 'rack'], 'push_h', 's2', '', 'r', 'Pinch the shoulder blades, touch the chest, press.'],

  // ---------- Small straight barbell ----------
  ['sbb_curl', 'Small bar curl', ['sbb'], 'arms_bi', 'e1', '', 'r', 'Elbows pinned to your sides, squeeze at the top.'],
  ['sbb_upright_row', 'Small bar upright row', ['sbb'], 'shoulder_iso', 's2', '', 'r', 'Wide grip, elbows lead, stop at chest height.'],
  ['sbb_press', 'Small bar overhead press', ['sbb'], 'push_v', 's2', '', 'r', 'Squeeze glutes, press to lockout.'],
  ['sbb_front_raise', 'Small bar front raise', ['sbb'], 'shoulder_iso', 's1', '', 'r', 'Raise to eye level, slow down.'],
  ['sbb_row', 'Small bar bent-over row', ['sbb'], 'pull', 'b2', '', 'r', 'Hinge, flat back, pull to the belly.'],
  ['sbb_rdl', 'Small bar RDL', ['sbb'], 'hinge', 'b2 h1', '', 'r', 'Hips back, flat back, feel the hamstrings.'],
  ['sbb_floor_press', 'Small bar floor press', ['sbb'], 'push_h', 's1', '', 'r', 'Lying down, elbows to the floor, press.'],
  ['sbb_thruster', 'Small bar thruster', ['sbb'], 'full', 'k2 s2', '', 'r', 'Front squat into a press.'],
  ['sbb_back_squat', 'Small bar back squat', ['sbb'], 'squat', 'k2 b1', '', 'r', 'Light bar on the back, sit down, drive up.'],
  ['sbb_reverse_lunge', 'Small bar reverse lunge', ['sbb'], 'lunge', 'k2', '', 'r', 'Bar on the back, step back. Reps are total.'],
  ['sbb_good_morning', 'Small bar good morning', ['sbb'], 'hinge', 'b2', '', 'r', 'Light bar on the back, hips back, flat back.'],

  // ---------- EZ / curl bar ----------
  ['ez_curl', 'EZ bar curl', ['ez'], 'arms_bi', 'e1', '', 'r', 'Elbows still, full range, no swinging.'],
  ['ez_reverse_curl', 'EZ bar reverse curl', ['ez'], 'arms_bi', 'e1 w1', '', 'r', 'Overhand grip, slow down.'],
  ['ez_drag_curl', 'EZ bar drag curl', ['ez'], 'arms_bi', 'e1', '', 'r', 'Drag the bar up your body, elbows go back.'],
  ['ez_skullcrusher', 'EZ bar skull crusher (floor)', ['ez'], 'arms_tri', 'e2', '', 'r', 'Lying down, lower to the forehead, extend.'],
  ['ez_overhead_ext', 'EZ bar overhead extension', ['ez'], 'arms_tri', 'e2 s1', '', 'r', 'Elbows narrow, lower behind the head.'],
  ['ez_cg_press', 'EZ bar close-grip floor press', ['ez'], 'push_h', 's1 e1', '', 'r', 'Narrow grip, elbows tucked, press.'],
  ['ez_upright_row', 'EZ bar upright row', ['ez'], 'shoulder_iso', 's2', '', 'r', 'Elbows lead, stop at chest height.'],
  ['ez_row', 'EZ bar bent-over row', ['ez'], 'pull', 'b2', '', 'r', 'Hinge, pull to the belly, squeeze.'],

  // ---------- Resistance band ----------
  ['band_pull_apart', 'Band pull-apart', ['band'], 'shoulder_iso', '', '', 'r', 'Straight arms, pull the band to the chest.'],
  ['band_row', 'Band row', ['band'], 'pull', '', '', 'r', 'Anchor the band, pull elbows back, squeeze.'],
  ['band_face_pull', 'Band face pull', ['band'], 'shoulder_iso', '', '', 'r', 'Pull to the eyes, thumbs back, elbows high.'],
  ['band_pallof', 'Band Pallof press', ['band'], 'core_rot', '', 'U', 'r', 'Side-on to the anchor, press out, resist the twist.'],
  ['band_good_morning', 'Band good morning', ['band'], 'hinge', 'b1', '', 'r', 'Band under the feet and behind the neck, hinge.'],
  ['band_squat', 'Band squat', ['band'], 'squat', 'k1', '', 'r', 'Band under the feet, at the shoulders, squat.'],
  ['band_lateral_walk', 'Band lateral walk', ['band'], 'hinge', 'h1', '', 'r', 'Band round the knees, half squat, step wide. Steps are total.'],
  ['band_chest_press', 'Band chest press', ['band'], 'push_h', 's1', '', 'r', 'Band behind the back, press forward.'],
  ['band_press', 'Band overhead press', ['band'], 'push_v', 's1', '', 'r', 'Stand on the band, press overhead.'],
  ['band_curl', 'Band curl', ['band'], 'arms_bi', '', '', 'r', 'Stand on the band, elbows pinned.'],
  ['band_pushdown', 'Band tricep pushdown', ['band'], 'arms_tri', 'e1', '', 'r', 'Anchor high, elbows pinned, push down.'],
  ['band_glute_bridge', 'Band glute bridge', ['band'], 'hinge', 'h1', '', 'r', 'Band round the knees, push them out, bridge up.'],
  ['band_woodchop', 'Band woodchop', ['band'], 'core_rot', 'b1', '', 'r', 'High to low across the body. Reps are total.'],
  ['band_dislocate', 'Band shoulder dislocate', ['band'], 'mobility', 's1', '', 's', 'Wide grip, straight arms over and behind.'],
  ['band_pulldown', 'Band lat pulldown (kneeling)', ['band'], 'pull', '', '', 'r', 'Anchor high, pull elbows to the ribs.'],
  ['band_hamstring', 'Banded hamstring stretch', ['band'], 'mobility', '', '', 's', 'On your back, band round the foot, straight leg. Switch halfway.'],

  // ---------- Medicine ball ----------
  ['mb_slam', 'Med ball slam', ['mb'], 'power', 'b2 s1', 'L', 'r', 'Full extension, slam hard. Outside or on a mat.'],
  ['mb_wall_ball', 'Wall ball', ['mb'], 'full', 'k2 s2', 'L', 'r', 'Squat and throw to a target 2–3 m up.'],
  ['mb_russian_twist', 'Med ball Russian twist', ['mb'], 'core_rot', 'b2', '', 'r', 'Tap the ball side to side. Reps are total.'],
  ['mb_squat_press', 'Med ball squat to press', ['mb'], 'full', 'k1 s1', '', 'r', 'Hold at the chest, squat, press overhead. Quiet version of a wall ball.'],
  ['mb_ground_overhead', 'Med ball ground to overhead', ['mb'], 'full', 'b2 s2', '', 'r', 'Squat to pick up, stand, lift overhead.'],
  ['mb_woodchop', 'Med ball woodchop', ['mb'], 'core_rot', 'b2', '', 'r', 'High to low, controlled. Reps are total.'],
  ['mb_v_up', 'Med ball V-up pass', ['mb'], 'core', 'b2 h1', '', 'r', 'Pass the ball from hands to feet at the top.'],
  ['mb_rot_throw', 'Med ball rotational throw', ['mb'], 'core_rot', 'b2 s1', 'L', 'r', 'Side-on to a wall, rotate and throw. Reps are total.'],
  ['mb_goblet_squat', 'Med ball goblet squat', ['mb'], 'squat', 'k1', '', 'r', 'Ball at the chest, sit deep.'],
  ['mb_plank_pass', 'Med ball plank pass', ['mb'], 'core', 'w2 s1', '', 'r', 'In plank, drag the ball under your body side to side. Reps are total.'],
  ['mb_sit_up_press', 'Med ball sit-up press', ['mb'], 'core', 'b2', '', 'r', 'Sit up and press the ball overhead.'],

  // ---------- Skipping rope ----------
  ['skip', 'Skipping', ['rope'], 'cardio', 'a2 k1', 'L', 'r', 'Light bounce, wrists turn the rope. Count single skips.'],
  ['skip_time', 'Skipping', ['rope'], 'cardio', 'a2 k1', 'L', 's', 'Steady rhythm, relaxed shoulders.'],
  ['skip_easy', 'Easy skipping', ['rope'], 'cardio_low', 'a1', 'L', 's', 'Relaxed bounce. Stay smooth.'],

  // ---------- More home-gym kit ----------
  // Ski erg
  ['ski_cal', 'Ski erg', ['ski'], 'cardio', 'b1 s1', '', 'r', 'Hinge and drive the handles down past the hips. Count calories.'],
  ['ski_time', 'Ski erg', ['ski'], 'cardio', 'b1 s1', '', 's', 'Strong pulls, use the hips, steady rhythm.'],
  ['ski_easy', 'Easy ski erg', ['ski'], 'cardio_low', 's1', '', 's', 'Smooth and relaxed, conversation pace.'],
  // Rower / bike / treadmill extras
  ['row_time', 'Row', ['rower'], 'cardio', 'b1', '', 's', 'Legs, body, arms. Hard but repeatable.'],
  ['row_easy', 'Easy row', ['rower'], 'cardio_low', 'b1', '', 's', 'Long smooth strokes, about 20 strokes a minute.'],
  ['row_m', 'Row', ['rower'], 'cardio', 'b1', '', 'm', 'Strong drive with the legs, quick hands away.'],
  ['bike_time', 'Bike', ['bike'], 'cardio', '', '', 's', 'Push hard, stay seated, breathe.'],
  ['bike_easy', 'Easy ride', ['bike'], 'cardio_low', '', '', 's', 'Easy spin, conversation pace.'],
  ['tread_run', 'Treadmill run', ['treadmill'], 'cardio', 'k2 a2', '', 's', 'Fast but controlled, stay off the rails.'],
  ['tread_incline', 'Incline walk', ['treadmill'], 'cardio_low', 'a1', '', 's', 'Incline 8–12%, brisk walk, no holding on.'],
  ['tread_jog', 'Treadmill jog', ['treadmill'], 'cardio_low', 'k1 a1', '', 's', 'Easy pace, relaxed.'],
  // Sandbag / power bag
  ['sb_clean', 'Sandbag clean', ['sandbag'], 'power', 'b2', '', 'r', 'Hinge, rip it up to the chest, catch in a squat.'],
  ['sb_bearhug_squat', 'Sandbag bear-hug squat', ['sandbag'], 'squat', 'k2 b1', '', 'r', 'Hug the bag tight, sit deep, chest up.'],
  ['sb_shoulder', 'Sandbag to shoulder', ['sandbag'], 'power', 'b2 s1', '', 'r', 'Floor to alternating shoulders. Reps are total.'],
  ['sb_zercher', 'Sandbag Zercher squat', ['sandbag'], 'squat', 'k2 b1', '', 'r', 'Bag in the crook of the elbows, squat tall.'],
  ['sb_lunge', 'Sandbag reverse lunge', ['sandbag'], 'lunge', 'k2', '', 'r', 'Bear-hug the bag, step back. Reps are total.'],
  ['sb_row', 'Sandbag bent-over row', ['sandbag'], 'pull', 'b2', '', 'r', 'Hinge, pull the handles to the belly.'],
  ['sb_press', 'Sandbag overhead press', ['sandbag'], 'push_v', 's2', '', 'r', 'From the chest, press up, ribs down.'],
  ['sb_rdl', 'Sandbag RDL', ['sandbag'], 'hinge', 'b2 h1', '', 'r', 'Hips back, flat back, bag close to the legs.'],
  ['sb_carry', 'Sandbag bear-hug march', ['sandbag'], 'carry', 'b1', '', 's', 'Hug it high, march tall on the spot.'],
  ['sb_getup', 'Sandbag get-up', ['sandbag'], 'full', 'b1 k1', '', 'r', 'Bag on the shoulder, lie down, stand back up. Alternate.'],
  // Slam ball
  ['sball_slam', 'Slam ball slam', ['slamball'], 'power', 'b2 s1', 'L', 'r', 'Full extension, slam it hard. Outside or on a mat.'],
  ['sball_over_shoulder', 'Ball over the shoulder', ['slamball'], 'power', 'b2', 'L', 'r', 'Pick up, extend and toss it over a shoulder. Alternate.'],
  ['sball_clean', 'Slam ball squat clean', ['slamball'], 'full', 'k2 b1', '', 'r', 'Squat to the ball, explode up, catch at the chest.'],
  ['sball_rot', 'Rotational slam', ['slamball'], 'core_rot', 'b2 s1', 'L', 'r', 'Slam to the outside of each foot. Reps are total.'],
  ['sball_squat_press', 'Slam ball squat to press', ['slamball'], 'full', 'k1 s1', '', 'r', 'Quiet version: squat holding the ball, press overhead.'],
  // Suspension trainer
  ['trx_row', 'Suspension row', ['trx'], 'pull', '', '', 'r', 'Body straight, pull chest to hands. Walk feet in to make it harder.'],
  ['trx_pushup', 'Suspension push-up', ['trx'], 'push_h', 's2 w1', '', 'r', 'Feet in the cradles or hands in the handles, tight core.'],
  ['trx_squat', 'Suspension assisted squat', ['trx'], 'squat', 'k1', '', 'r', 'Hold the handles, sit back deep, stand tall.'],
  ['trx_lunge', 'Suspension lunge', ['trx'], 'lunge', 'k2', 'U', 'r', 'Back foot in the cradle, drop straight down.'],
  ['trx_ytw', 'Suspension Y-T-W', ['trx'], 'shoulder_iso', 's1', '', 'r', 'Arms straight, make Y, T, then W shapes.'],
  ['trx_pike', 'Suspension pike', ['trx'], 'core', 's2 w1', '', 'r', 'Feet in the cradles, lift hips high.'],
  ['trx_fallout', 'Suspension fallout', ['trx'], 'core', 's2 b2', '', 'r', 'Lean forward with straight arms, ribs down.'],
  ['trx_ham_curl', 'Suspension hamstring curl', ['trx'], 'hinge', 'h1', '', 'r', 'Heels in the cradles, bridge up, curl in.'],
  // Rings
  ['ring_row', 'Ring row', ['rings'], 'pull', '', '', 'r', 'Body straight, pull and turn the rings out at the top.'],
  ['ring_dip', 'Ring dip', ['rings'], 'arms_tri', 's3 e2', '', 'r', 'Rings close to the body, shoulders down.'],
  ['ring_pushup', 'Ring push-up', ['rings'], 'push_h', 's2 w1', '', 'r', 'Rings low, turn them out at the top.'],
  ['ring_support', 'Ring support hold', ['rings'], 'core', 's2', '', 's', 'Arms locked, rings by the hips, still.'],
  // Battle rope
  ['battle_waves', 'Battle rope waves', ['battle'], 'cardio', 's1', '', 's', 'Half squat, fast double-arm waves.'],
  ['battle_alt', 'Battle rope alternating waves', ['battle'], 'cardio', 's1', '', 's', 'Alternate arms, keep the waves to the anchor.'],
  ['battle_slams', 'Battle rope slams', ['battle'], 'power', 's1 b1', 'L', 's', 'Big overhead lift, slam with the whole body.'],
  ['battle_circles', 'Battle rope circles', ['battle'], 'cardio_low', 's1', '', 's', 'Circle both arms outward, then inward.'],
  // Weight vest
  ['vest_walk', 'Weighted vest walk', ['vest'], 'cardio_low', 'k1', '', 's', 'Brisk walk with the vest on. Tall posture.'],
  ['vest_squat', 'Weighted vest squat', ['vest'], 'squat', 'k2', '', 'r', 'Full depth, controlled.'],
  ['vest_pushup', 'Weighted vest push-up', ['vest'], 'push_h', 's2 w2', '', 'r', 'Body in one line, chest to the floor.'],
  ['vest_lunge', 'Weighted vest reverse lunge', ['vest'], 'lunge', 'k2', '', 'r', 'Step back, stay tall. Reps are total.'],
  // Ab wheel
  ['abwheel_knee', 'Ab wheel rollout (knees)', ['abwheel'], 'core', 'b1 s1', '', 'r', 'Ribs down, roll out only as far as the back stays flat.'],
  ['abwheel_full', 'Ab wheel rollout (standing)', ['abwheel'], 'core', 'b2 s2', '', 'r', 'Advanced. Hollow body, no sagging.'],
  // Dip station / parallettes
  ['dip', 'Dip', ['dip'], 'arms_tri', 's3 e2', '', 'r', 'Shoulders down, lean slightly forward.'],
  ['dip_knee_raise', 'Knee raise (dip station)', ['dip'], 'core', 's1', '', 'r', 'Support on the arms, knees to chest.'],
  ['lsit', 'L-sit / tuck hold', ['dip'], 'core', 's1 h1', '', 's', 'Push down hard, tuck or straight legs.'],
  // Stability ball
  ['sw_ham_curl', 'Stability ball hamstring curl', ['swissball'], 'hinge', 'h1', '', 'r', 'Bridge up, curl the ball in, hips stay high.'],
  ['sw_back_ext', 'Stability ball back extension', ['swissball'], 'core', 'b1', '', 'r', 'Hips on the ball, lift the chest gently. Back-friendly.'],
  ['sw_stir_pot', 'Stir the pot', ['swissball'], 'core', 's1', '', 's', 'Forearms on the ball, small circles.'],
  ['sw_pike', 'Stability ball pike', ['swissball'], 'core', 's2 w1', '', 'r', 'Feet on the ball, lift the hips high.'],
  ['sw_crunch', 'Stability ball crunch', ['swissball'], 'core', 'n1', '', 'r', 'Lower back on the ball, curl up.'],
  ['sw_pass', 'Stability ball pass', ['swissball'], 'core', 'b2 h1', '', 'r', 'Pass the ball from hands to feet and back.'],
  // Mini loop bands
  ['loop_walk', 'Mini-band lateral walk', ['loopband'], 'hinge', 'h1', '', 'r', 'Band above the knees, half squat, step wide. Steps are total.'],
  ['loop_clam', 'Mini-band clamshell', ['loopband'], 'hinge', 'h1', 'U', 'r', 'Side-lying, open the knees, hips stay stacked.'],
  ['loop_monster', 'Mini-band monster walk', ['loopband'], 'hinge', 'h1', '', 'r', 'Diagonal steps forward and back. Steps are total.'],
  ['loop_squat', 'Mini-band squat', ['loopband'], 'squat', 'k1', '', 'r', 'Push the knees out into the band.'],
  ['loop_kickback', 'Mini-band glute kickback', ['loopband'], 'hinge', 'h1', 'U', 'r', 'On all fours, kick back and up, squeeze.'],
  ['loop_bridge', 'Mini-band glute bridge', ['loopband'], 'hinge', 'h1', '', 'r', 'Knees out against the band, bridge up, pause.'],
  // Pull-up bar extras
  ['dead_hang', 'Dead hang', ['pullup'], 'mobility', 's1', '', 's', 'Relax and hang. Great for the shoulders and spine.'],
  ['scap_pull', 'Scapular pull-up', ['pullup'], 'pull', 's1', '', 'r', 'Arms straight, pull the shoulder blades down.'],
  ['negative_pullup', 'Negative pull-up', ['pullup'], 'pull', 's2 e1', '', 'r', 'Jump or step up, lower slowly (3–5 seconds).'],
  // Bench / box extras
  ['incline_pushup', 'Incline push-up', ['bench'], 'push_h', 's1 w1', '', 'r', 'Hands on the bench, body straight. Easier than the floor.'],
  ['decline_pushup', 'Decline push-up', ['bench'], 'push_h', 's2 w2', '', 'r', 'Feet on the bench, chest to the floor.'],
  ['db_hip_thrust', 'DB hip thrust', ['db', 'bench'], 'hinge', 'h1', '', 'r', 'Shoulders on the bench, drive the hips up, pause.'],
  ['box_step_over', 'Box step-over', ['box'], 'cardio', 'k2', '', 'r', 'Step up and over, alternate legs. Reps are total.'],

  // ---------- Box / bench / future kit ----------
  ['box_step_up', 'Box step-up', ['box'], 'lunge', 'k2', '', 'r', 'Drive through the heel, stand tall. Reps are total.'],
  ['box_jump', 'Box jump', ['box'], 'power', 'k2 a2', 'L', 'r', 'Land soft, step down.'],
  ['bench_dip', 'Bench dip', ['bench'], 'arms_tri', 's3 e2', '', 'r', 'Shoulders down, elbows back.'],
  ['bulgarian', 'Bulgarian split squat', ['bench'], 'lunge', 'k2', 'U', 'r', 'Back foot on the bench, drop straight down.'],
  ['pullup', 'Pull-up', ['pullup'], 'pull', 's2 e1', '', 'r', 'Full hang, chest to the bar.'],
  ['chin_up', 'Chin-up', ['pullup'], 'pull', 's1 e2', '', 'r', 'Palms facing you, chin over the bar.'],
  ['hanging_knee_raise', 'Hanging knee raise', ['pullup'], 'core', 's1', '', 'r', 'No swinging, knees to the chest.'],
  ['row_cal', 'Row', ['rower'], 'cardio', 'b1', '', 'r', 'Legs, body, arms. Arms, body, legs. Count calories.'],
  ['bike_cal', 'Bike', ['bike'], 'cardio', '', '', 'r', 'Seated, steady push. Count calories.'],
];

export const STRESS_AREAS = {
  b: 'Lower back', n: 'Neck', s: 'Shoulder', e: 'Elbow', w: 'Wrist', h: 'Hip', k: 'Knee', a: 'Ankle',
};

function parseStress(str) {
  const out = {};
  for (const tok of str.split(/\s+/).filter(Boolean)) out[tok[0]] = Number(tok.slice(1));
  return out;
}

export const EXERCISES = {};
for (const [id, name, eq, pattern, stress, flags, unit, cue] of RAW) {
  EXERCISES[id] = {
    id, name, eq, pattern, unit, cue,
    stress: parseStress(stress),
    loud: flags.includes('L'),
    outdoor: flags.includes('O'),
    uni: flags.includes('U'),
  };
}

export const EQUIPMENT = {
  bw: { name: 'Bodyweight', short: 'BW', group: '' },
  // free weights
  kb: { name: 'Kettlebell', short: 'KB', group: 'Free weights' },
  db: { name: 'Dumbbells', short: 'DB', group: 'Free weights' },
  sandbag: { name: 'Sandbag / power bag', short: 'Sandbag', group: 'Free weights' },
  mb: { name: 'Medicine ball', short: 'Med ball', group: 'Free weights' },
  slamball: { name: 'Slam ball', short: 'Slam ball', group: 'Free weights' },
  vest: { name: 'Weight vest', short: 'Vest', group: 'Free weights' },
  // bars
  bb: { name: 'Barbell', short: 'BB', group: 'Bars and racks' },
  sbb: { name: 'Small straight bar', short: 'Small bar', group: 'Bars and racks' },
  ez: { name: 'Curl bar', short: 'Curl bar', group: 'Bars and racks' },
  rack: { name: 'Squat rack', short: 'Rack', group: 'Bars and racks' },
  bench: { name: 'Bench', short: 'Bench', group: 'Bars and racks' },
  // bodyweight stations
  pullup: { name: 'Pull-up bar', short: 'Pull-up bar', group: 'Bodyweight stations' },
  rings: { name: 'Gymnastic rings', short: 'Rings', group: 'Bodyweight stations' },
  trx: { name: 'Suspension trainer (TRX)', short: 'TRX', group: 'Bodyweight stations' },
  dip: { name: 'Dip station / parallettes', short: 'Dip station', group: 'Bodyweight stations' },
  box: { name: 'Plyo box / step', short: 'Box', group: 'Bodyweight stations' },
  // cardio
  rope: { name: 'Skipping rope', short: 'Rope', group: 'Cardio' },
  run: { name: 'Running route', short: 'Run', group: 'Cardio' },
  rower: { name: 'Rowing machine', short: 'Rower', group: 'Cardio' },
  bike: { name: 'Exercise / air bike', short: 'Bike', group: 'Cardio' },
  ski: { name: 'Ski erg', short: 'Ski erg', group: 'Cardio' },
  treadmill: { name: 'Treadmill', short: 'Treadmill', group: 'Cardio' },
  battle: { name: 'Battle rope', short: 'Battle rope', group: 'Cardio' },
  // small stuff
  band: { name: 'Resistance band (long)', short: 'Band', group: 'Bands and accessories' },
  loopband: { name: 'Mini loop bands', short: 'Mini bands', group: 'Bands and accessories' },
  swissball: { name: 'Stability ball', short: 'Stability ball', group: 'Bands and accessories' },
  abwheel: { name: 'Ab wheel', short: 'Ab wheel', group: 'Bands and accessories' },
};

// Equipment that doesn't count toward the "max 2 pieces" rule
export const FREE_EQUIPMENT = new Set(['bw', 'run']);

// Suggested weight jumps (kg) per equipment, for progression suggestions
export const WEIGHT_STEP = { kb: 4, db: 2, bb: 5, sbb: 2.5, ez: 2.5, mb: 2, sandbag: 5, slamball: 2, vest: 2.5 };
export const LOADED = new Set(['kb', 'db', 'bb', 'sbb', 'ez', 'mb', 'sandbag', 'slamball', 'vest']);

export const PATTERN_FALLBACK = {
  squat: ['squat', 'lunge', 'hinge', 'core'],
  lunge: ['lunge', 'squat', 'hinge', 'core'],
  hinge: ['hinge', 'core'],
  push_h: ['push_h', 'push_v', 'shoulder_iso', 'core'],
  push_v: ['push_v', 'push_h', 'shoulder_iso', 'core'],
  pull: ['pull', 'shoulder_iso', 'core'],
  arms_bi: ['arms_bi', 'pull', 'shoulder_iso'],
  arms_tri: ['arms_tri', 'push_h', 'shoulder_iso'],
  shoulder_iso: ['shoulder_iso', 'pull', 'core'],
  core: ['core', 'core_rot', 'mobility'],
  core_rot: ['core_rot', 'core'],
  carry: ['carry', 'core'],
  cardio: ['cardio', 'cardio_low', 'core'],
  cardio_low: ['cardio_low', 'cardio', 'core', 'mobility'],
  power: ['power', 'full', 'hinge', 'cardio_low'],
  full: ['full', 'power', 'cardio', 'cardio_low'],
  mobility: ['mobility'],
};

export function ytSearch(name) {
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(name + ' exercise form');
}
