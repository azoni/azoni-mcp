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

// Helper: calculate estimated 1RM
function calculateE1RM(weight, reps) {
  if (reps === 1) return weight;
  if (reps > 12) return null;
  return Math.round(weight * (36 / (37 - reps)));
}

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

export async function getMaxLifts(username) {
  const db = getDb();
  const user = await findUser(username);
  
  if (!user) return { error: 'User not found' };
  
  const maxes = {};
  
  // Helper to process workouts
  function processWorkout(data) {
    (data.exercises || []).forEach(ex => {
      (ex.sets || []).forEach(set => {
        const weight = parseFloat(set.actualWeight) || parseFloat(set.prescribedWeight) || 0;
        const reps = parseInt(set.actualReps) || parseInt(set.prescribedReps) || 0;
        
        if (weight > 0 && reps > 0 && reps <= 12) {
          const e1rm = Math.round(weight * (1 + reps / 30)); // Epley formula
          
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
  
  // Get personal workouts
  const personalSnapshot = await db.collection('workouts')
    .where('userId', '==', user.id)
    .where('status', '==', 'completed')
    .get();
  
  personalSnapshot.docs.forEach(doc => processWorkout(doc.data()));
  
  // Get group workouts
  const groupSnapshot = await db.collection('groupWorkouts')
    .where('assignedTo', '==', user.id)
    .where('status', '==', 'completed')
    .get();
  
  groupSnapshot.docs.forEach(doc => processWorkout(doc.data()));
  
  // Sort by estimated 1RM descending
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