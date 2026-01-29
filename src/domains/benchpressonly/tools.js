import { getDb } from '../../firebase.js';

// Helper: find user by username
async function findUser(username) {
  const db = getDb();
  const snapshot = await db.collection('users')
    .where('username', '==', username.toLowerCase())
    .limit(1)
    .get();
  
  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

// ============ PROFILE & STATS ============

export async function getUserProfile(username) {
  const db = getDb();
  const user = await findUser(username);
  
  if (!user) return { error: 'User not found' };
  
  // Get workout counts
  const personalWorkouts = await db.collection('workouts')
    .where('userId', '==', user.id)
    .where('status', '==', 'completed')
    .get();
  
  const groupWorkouts = await db.collection('groupWorkouts')
    .where('assignedTo', '==', user.id)
    .where('status', '==', 'completed')
    .get();
  
  const totalWorkouts = personalWorkouts.size + groupWorkouts.size;
  
  // Get groups
  const groups = await db.collection('groups')
    .where('members', 'array-contains', user.id)
    .get();
  
  const coachingGroups = await db.collection('groups')
    .where('admins', 'array-contains', user.id)
    .get();
  
  return {
    displayName: user.displayName,
    username: user.username,
    memberSince: user.createdAt?.toDate?.().toISOString().split('T')[0] || null,
    totalWorkouts,
    groupsMember: groups.size,
    groupsCoaching: coachingGroups.size,
    isCoach: coachingGroups.size > 0,
  };
}

export async function getBodyStats(username) {
  const user = await findUser(username);
  
  if (!user) return { error: 'User not found' };
  
  const heightInches = user.heightFeet ? (user.heightFeet * 12) + (user.heightInches || 0) : null;
  const heightCm = heightInches ? Math.round(heightInches * 2.54) : null;
  
  let bmi = null;
  if (user.weight && heightInches) {
    bmi = ((user.weight / (heightInches * heightInches)) * 703).toFixed(1);
  }
  
  return {
    user: user.displayName,
    weight: user.weight ? `${user.weight} lbs` : null,
    height: user.heightFeet ? `${user.heightFeet}'${user.heightInches || 0}"` : null,
    heightCm: heightCm ? `${heightCm} cm` : null,
    bmi,
    age: user.age || null,
    activityLevel: user.activityLevel || null,
  };
}

// ============ STREAKS & CONSISTENCY ============

export async function getStreak(username) {
  const db = getDb();
  const user = await findUser(username);
  
  if (!user) return { error: 'User not found' };
  
  // Get all completed workouts sorted by date
  const personalSnapshot = await db.collection('workouts')
    .where('userId', '==', user.id)
    .where('status', '==', 'completed')
    .orderBy('date', 'desc')
    .get();
  
  const groupSnapshot = await db.collection('groupWorkouts')
    .where('assignedTo', '==', user.id)
    .where('status', '==', 'completed')
    .orderBy('date', 'desc')
    .get();
  
  // Combine and get unique dates
  const allDates = new Set();
  
  personalSnapshot.docs.forEach(doc => {
    const date = doc.data().date?.toDate?.();
    if (date) allDates.add(date.toISOString().split('T')[0]);
  });
  
  groupSnapshot.docs.forEach(doc => {
    const date = doc.data().date?.toDate?.();
    if (date) allDates.add(date.toISOString().split('T')[0]);
  });
  
  const sortedDates = Array.from(allDates).sort().reverse();
  
  if (sortedDates.length === 0) {
    return { user: user.displayName, currentStreak: 0, longestStreak: 0, totalDays: 0 };
  }
  
  // Calculate current streak (consecutive days from today or yesterday)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  let currentStreak = 0;
  let checkDate = new Date(sortedDates[0]);
  
  // Only count if last workout was today or yesterday
  if (checkDate >= yesterday) {
    currentStreak = 1;
    for (let i = 1; i < sortedDates.length; i++) {
      const prevDate = new Date(sortedDates[i]);
      const diff = (checkDate - prevDate) / (1000 * 60 * 60 * 24);
      if (diff <= 1) {
        currentStreak++;
        checkDate = prevDate;
      } else {
        break;
      }
    }
  }
  
  // Calculate longest streak
  let longestStreak = 1;
  let tempStreak = 1;
  
  for (let i = 1; i < sortedDates.length; i++) {
    const curr = new Date(sortedDates[i - 1]);
    const prev = new Date(sortedDates[i]);
    const diff = (curr - prev) / (1000 * 60 * 60 * 24);
    
    if (diff <= 1) {
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else {
      tempStreak = 1;
    }
  }
  
  return {
    user: user.displayName,
    currentStreak,
    longestStreak,
    totalDays: sortedDates.length,
    lastWorkout: sortedDates[0],
  };
}

export async function getConsistency(username, periodDays = 90) {
  const db = getDb();
  const user = await findUser(username);
  
  if (!user) return { error: 'User not found' };
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);
  
  const personalSnapshot = await db.collection('workouts')
    .where('userId', '==', user.id)
    .where('status', '==', 'completed')
    .where('date', '>=', startDate)
    .get();
  
  const groupSnapshot = await db.collection('groupWorkouts')
    .where('assignedTo', '==', user.id)
    .where('status', '==', 'completed')
    .where('date', '>=', startDate)
    .get();
  
  const totalWorkouts = personalSnapshot.size + groupSnapshot.size;
  const weeksInPeriod = periodDays / 7;
  const workoutsPerWeek = (totalWorkouts / weeksInPeriod).toFixed(1);
  
  // Get unique days
  const uniqueDays = new Set();
  personalSnapshot.docs.forEach(doc => {
    const date = doc.data().date?.toDate?.();
    if (date) uniqueDays.add(date.toISOString().split('T')[0]);
  });
  groupSnapshot.docs.forEach(doc => {
    const date = doc.data().date?.toDate?.();
    if (date) uniqueDays.add(date.toISOString().split('T')[0]);
  });
  
  return {
    user: user.displayName,
    period: `Last ${periodDays} days`,
    totalWorkouts,
    uniqueDays: uniqueDays.size,
    workoutsPerWeek,
    consistency: `${Math.round((uniqueDays.size / periodDays) * 100)}%`,
  };
}

// ============ VOLUME & EXERCISES ============

export async function getTrainingVolume(username, periodDays = 30) {
  const db = getDb();
  const user = await findUser(username);
  
  if (!user) return { error: 'User not found' };
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);
  
  let totalVolume = 0;
  let totalSets = 0;
  let totalReps = 0;
  
  function processWorkout(data) {
    (data.exercises || []).forEach(ex => {
      (ex.sets || []).forEach(set => {
        const weight = parseFloat(set.actualWeight) || parseFloat(set.prescribedWeight) || 0;
        const reps = parseInt(set.actualReps) || parseInt(set.prescribedReps) || 0;
        
        if (weight > 0 && reps > 0) {
          totalVolume += weight * reps;
          totalSets++;
          totalReps += reps;
        }
      });
    });
  }
  
  const personalSnapshot = await db.collection('workouts')
    .where('userId', '==', user.id)
    .where('status', '==', 'completed')
    .where('date', '>=', startDate)
    .get();
  
  const groupSnapshot = await db.collection('groupWorkouts')
    .where('assignedTo', '==', user.id)
    .where('status', '==', 'completed')
    .where('date', '>=', startDate)
    .get();
  
  personalSnapshot.docs.forEach(doc => processWorkout(doc.data()));
  groupSnapshot.docs.forEach(doc => processWorkout(doc.data()));
  
  return {
    user: user.displayName,
    period: `Last ${periodDays} days`,
    totalVolume: `${totalVolume.toLocaleString()} lbs`,
    totalSets,
    totalReps,
    avgVolumePerWorkout: personalSnapshot.size + groupSnapshot.size > 0 
      ? `${Math.round(totalVolume / (personalSnapshot.size + groupSnapshot.size)).toLocaleString()} lbs`
      : '0 lbs',
  };
}

export async function getTopExercises(username, limit = 10) {
  const db = getDb();
  const user = await findUser(username);
  
  if (!user) return { error: 'User not found' };
  
  const exerciseCounts = {};
  const exerciseVolume = {};
  
  function processWorkout(data) {
    (data.exercises || []).forEach(ex => {
      const name = ex.name;
      exerciseCounts[name] = (exerciseCounts[name] || 0) + 1;
      
      (ex.sets || []).forEach(set => {
        const weight = parseFloat(set.actualWeight) || parseFloat(set.prescribedWeight) || 0;
        const reps = parseInt(set.actualReps) || parseInt(set.prescribedReps) || 0;
        exerciseVolume[name] = (exerciseVolume[name] || 0) + (weight * reps);
      });
    });
  }
  
  const personalSnapshot = await db.collection('workouts')
    .where('userId', '==', user.id)
    .where('status', '==', 'completed')
    .get();
  
  const groupSnapshot = await db.collection('groupWorkouts')
    .where('assignedTo', '==', user.id)
    .where('status', '==', 'completed')
    .get();
  
  personalSnapshot.docs.forEach(doc => processWorkout(doc.data()));
  groupSnapshot.docs.forEach(doc => processWorkout(doc.data()));
  
  const byFrequency = Object.entries(exerciseCounts)
    .map(([name, count]) => ({ name, sessions: count, totalVolume: exerciseVolume[name] || 0 }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, limit);
  
  return {
    user: user.displayName,
    totalExercises: Object.keys(exerciseCounts).length,
    topByFrequency: byFrequency,
  };
}

// ============ PR HISTORY ============

export async function getPRHistory(username, exercise = null) {
  const db = getDb();
  const user = await findUser(username);
  
  if (!user) return { error: 'User not found' };
  
  const prHistory = {};
  
  function processWorkout(data, workoutDate) {
    (data.exercises || []).forEach(ex => {
      if (exercise && ex.name.toLowerCase() !== exercise.toLowerCase()) return;
      
      (ex.sets || []).forEach(set => {
        const weight = parseFloat(set.actualWeight) || parseFloat(set.prescribedWeight) || 0;
        const reps = parseInt(set.actualReps) || parseInt(set.prescribedReps) || 0;
        
        if (weight > 0 && reps > 0 && reps <= 12) {
          const e1rm = Math.round(weight * (1 + reps / 30));
          
          if (!prHistory[ex.name]) {
            prHistory[ex.name] = [];
          }
          
          const existing = prHistory[ex.name];
          const currentMax = existing.length > 0 ? Math.max(...existing.map(p => p.e1rm)) : 0;
          
          if (e1rm > currentMax) {
            prHistory[ex.name].push({
              date: workoutDate,
              weight,
              reps,
              e1rm,
            });
          }
        }
      });
    });
  }
  
  const personalSnapshot = await db.collection('workouts')
    .where('userId', '==', user.id)
    .where('status', '==', 'completed')
    .orderBy('date', 'asc')
    .get();
  
  const groupSnapshot = await db.collection('groupWorkouts')
    .where('assignedTo', '==', user.id)
    .where('status', '==', 'completed')
    .orderBy('date', 'asc')
    .get();
  
  personalSnapshot.docs.forEach(doc => {
    const data = doc.data();
    const date = data.date?.toDate?.().toISOString().split('T')[0];
    processWorkout(data, date);
  });
  
  groupSnapshot.docs.forEach(doc => {
    const data = doc.data();
    const date = data.date?.toDate?.().toISOString().split('T')[0];
    processWorkout(data, date);
  });
  
  // Format output
  const formatted = {};
  Object.entries(prHistory).forEach(([name, prs]) => {
    formatted[name] = {
      currentPR: prs[prs.length - 1],
      prCount: prs.length,
      history: prs,
    };
  });
  
  return {
    user: user.displayName,
    exercises: formatted,
  };
}

// ============ RECENT ACTIVITY ============

export async function getRecentWorkouts(username, limit = 5) {
  const db = getDb();
  const user = await findUser(username);
  
  if (!user) return { error: 'User not found' };
  
  const workoutsSnapshot = await db.collection('workouts')
    .where('userId', '==', user.id)
    .where('status', '==', 'completed')
    .orderBy('date', 'desc')
    .limit(limit)
    .get();
  
  const workouts = workoutsSnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      name: data.name,
      date: data.date?.toDate?.().toISOString().split('T')[0] || null,
      exercises: (data.exercises || []).map(ex => ({
        name: ex.name,
        sets: ex.sets?.length || 0,
      })),
    };
  });
  
  return {
    user: user.displayName,
    workoutCount: workouts.length,
    workouts,
  };
}

// ============ COACHING ============

export async function getCoachSummary(coachUsername) {
  const db = getDb();
  const user = await findUser(coachUsername);
  
  if (!user) return { error: 'Coach not found' };
  
  const groupsSnapshot = await db.collection('groups')
    .where('admins', 'array-contains', user.id)
    .get();
  
  if (groupsSnapshot.empty) {
    return { 
      coach: user.displayName,
      message: 'Not currently coaching any groups'
    };
  }
  
  const groups = [];
  let totalAthletes = 0;
  
  for (const groupDoc of groupsSnapshot.docs) {
    const groupData = groupDoc.data();
    const athletes = (groupData.members || []).filter(id => id !== user.id);
    totalAthletes += athletes.length;
    
    groups.push({
      name: groupData.name,
      athleteCount: athletes.length,
    });
  }
  
  return {
    coach: user.displayName,
    username: user.username,
    totalGroups: groups.length,
    totalAthletes,
    groups,
  };
}

export async function getAthleteProgress(coachUsername) {
  const db = getDb();
  const user = await findUser(coachUsername);
  
  if (!user) return { error: 'Coach not found' };
  
  const groupsSnapshot = await db.collection('groups')
    .where('admins', 'array-contains', user.id)
    .get();
  
  const athleteProgress = [];
  
  for (const groupDoc of groupsSnapshot.docs) {
    const groupData = groupDoc.data();
    const athleteIds = (groupData.members || []).filter(id => id !== user.id);
    
    for (const athleteId of athleteIds) {
      const athleteDoc = await db.collection('users').doc(athleteId).get();
      const athleteData = athleteDoc.data() || {};
      
      const workoutsSnapshot = await db.collection('groupWorkouts')
        .where('assignedTo', '==', athleteId)
        .where('groupId', '==', groupDoc.id)
        .get();
      
      const assigned = workoutsSnapshot.docs.length;
      const completed = workoutsSnapshot.docs.filter(d => d.data().status === 'completed').length;
      
      athleteProgress.push({
        name: athleteData.displayName || 'Unknown',
        group: groupData.name,
        workoutsAssigned: assigned,
        workoutsCompleted: completed,
        completionRate: assigned > 0 ? `${Math.round((completed / assigned) * 100)}%` : 'N/A',
      });
    }
  }
  
  return {
    coach: user.displayName,
    athletes: athleteProgress,
  };
}

// ============ MAXES & GOALS ============

export async function getMaxLifts(username) {
  const db = getDb();
  const user = await findUser(username);
  
  if (!user) return { error: 'User not found' };
  
  const maxes = {};
  
  function processWorkout(data) {
    (data.exercises || []).forEach(ex => {
      (ex.sets || []).forEach(set => {
        const weight = parseFloat(set.actualWeight) || parseFloat(set.prescribedWeight) || 0;
        const reps = parseInt(set.actualReps) || parseInt(set.prescribedReps) || 0;
        
        if (weight > 0 && reps > 0 && reps <= 12) {
          const e1rm = Math.round(weight * (1 + reps / 30));
          
          if (!maxes[ex.name] || e1rm > maxes[ex.name].estimated1RM) {
            maxes[ex.name] = {
              weight,
              reps,
              estimated1RM: e1rm,
            };
          }
        }
      });
    });
  }
  
  const personalSnapshot = await db.collection('workouts')
    .where('userId', '==', user.id)
    .where('status', '==', 'completed')
    .get();
  
  personalSnapshot.docs.forEach(doc => processWorkout(doc.data()));
  
  const groupSnapshot = await db.collection('groupWorkouts')
    .where('assignedTo', '==', user.id)
    .where('status', '==', 'completed')
    .get();
  
  groupSnapshot.docs.forEach(doc => processWorkout(doc.data()));
  
  const sortedMaxes = Object.entries(maxes)
    .map(([exercise, data]) => ({ exercise, ...data }))
    .sort((a, b) => (b.estimated1RM || 0) - (a.estimated1RM || 0));
  
  return {
    user: user.displayName,
    lifts: sortedMaxes,
  };
}

export async function getGoals(username, includeCompleted = false) {
  const db = getDb();
  const user = await findUser(username);
  
  if (!user) return { error: 'User not found' };
  
  let query = db.collection('goals').where('userId', '==', user.id);
  
  if (!includeCompleted) {
    query = query.where('status', '==', 'active');
  }
  
  const snapshot = await query.get();
  
  const goals = snapshot.docs.map(doc => {
    const data = doc.data();
    const startVal = parseFloat(data.startValue) || parseFloat(data.startWeight) || 0;
    const currentVal = parseFloat(data.currentValue) || parseFloat(data.currentWeight) || startVal;
    const targetVal = parseFloat(data.targetValue) || parseFloat(data.targetWeight) || 0;
    
    let progress = 0;
    if (targetVal > startVal) {
      progress = Math.round(((currentVal - startVal) / (targetVal - startVal)) * 100);
    }
    
    return {
      lift: data.lift,
      type: data.metricType || 'weight',
      start: startVal,
      current: currentVal,
      target: targetVal,
      progress: `${Math.min(100, Math.max(0, progress))}%`,
      status: data.status,
      targetDate: data.targetDate?.toDate?.().toISOString().split('T')[0] || null,
    };
  });
  
  return {
    user: user.displayName,
    activeGoals: goals.filter(g => g.status === 'active').length,
    goals,
  };
}