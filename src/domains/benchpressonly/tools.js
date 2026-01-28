import { getDb } from '../../firebase.js';

export async function getRecentWorkouts(username, limit = 5) {
  const db = getDb();
  
  // First, find user by username
  const usersSnapshot = await db.collection('users')
    .where('username', '==', username.toLowerCase())
    .limit(1)
    .get();
  
  if (usersSnapshot.empty) {
    return { error: 'User not found' };
  }
  
  const userId = usersSnapshot.docs[0].id;
  const userData = usersSnapshot.docs[0].data();
  
  // Get their workouts
  const workoutsSnapshot = await db.collection('workouts')
    .where('userId', '==', userId)
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
    user: userData.displayName,
    workoutCount: workouts.length,
    workouts,
  };
}

export async function getCoachSummary(coachUsername) {
  const db = getDb();
  
  // Find coach by username
  const usersSnapshot = await db.collection('users')
    .where('username', '==', coachUsername.toLowerCase())
    .limit(1)
    .get();
  
  if (usersSnapshot.empty) {
    return { error: 'Coach not found' };
  }
  
  const coachId = usersSnapshot.docs[0].id;
  const coachData = usersSnapshot.docs[0].data();
  
  // Find groups where this user is an admin (coach)
  const groupsSnapshot = await db.collection('groups')
    .where('admins', 'array-contains', coachId)
    .get();
  
  if (groupsSnapshot.empty) {
    return { 
      coach: coachData.displayName,
      message: 'Not currently coaching any groups'
    };
  }
  
  const groups = [];
  let totalAthletes = 0;
  
  for (const groupDoc of groupsSnapshot.docs) {
    const groupData = groupDoc.data();
    const athletes = (groupData.members || []).filter(id => id !== coachId);
    totalAthletes += athletes.length;
    
    groups.push({
      name: groupData.name,
      athleteCount: athletes.length,
    });
  }
  
  return {
    coach: coachData.displayName,
    username: coachData.username,
    totalGroups: groups.length,
    totalAthletes,
    groups,
  };
}

export async function getAthleteProgress(coachUsername) {
  const db = getDb();
  
  // Find coach
  const usersSnapshot = await db.collection('users')
    .where('username', '==', coachUsername.toLowerCase())
    .limit(1)
    .get();
  
  if (usersSnapshot.empty) {
    return { error: 'Coach not found' };
  }
  
  const coachId = usersSnapshot.docs[0].id;
  const coachData = usersSnapshot.docs[0].data();
  
  // Find groups they coach
  const groupsSnapshot = await db.collection('groups')
    .where('admins', 'array-contains', coachId)
    .get();
  
  const athleteProgress = [];
  
  for (const groupDoc of groupsSnapshot.docs) {
    const groupData = groupDoc.data();
    const athleteIds = (groupData.members || []).filter(id => id !== coachId);
    
    for (const athleteId of athleteIds) {
      // Get athlete info
      const athleteDoc = await db.collection('users').doc(athleteId).get();
      const athleteData = athleteDoc.data() || {};
      
      // Get their completed group workouts
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
    coach: coachData.displayName,
    athletes: athleteProgress,
  };
}