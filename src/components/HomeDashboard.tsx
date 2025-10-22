import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  SafeAreaView,
  Modal,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, onSnapshot, query, where, updateDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

interface ScheduleItem {
  time: string;
  title: string;
  location: string
  code: string;
}

interface ReservationItem {
  id: string;
  roomName: string;
  dateLabel: string;
  timeSlot: string;
  status: 'pending' | 'approved' | 'declined';
  requesterName: string;
  notes?: string;
  createdAt?: any;
}

interface HomeDashboardProps extends NativeStackScreenProps<RootStackParamList, 'Home'> {
  professorName?: string;
  professorId?: string;
  onLogout?: () => void;
  onSchedulePress?: () => void;
  onReservePress?: () => void;
  onNotificationsPress?: () => void;
  onHomePress?: () => void;
  onProfilePress?: () => void;
  onAdminSchedulePress?: () => void;
  onScheduleWithApproval?: () => void;
  onShowSubmittedPopup?: () => void;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  navigation,
  professorName = "",
  professorId,
  onLogout,
  onSchedulePress,
  onReservePress,
  onNotificationsPress,
  onHomePress,
  onProfilePress,
  onAdminSchedulePress,
  onScheduleWithApproval,
  onShowSubmittedPopup,
}) => {
  
  // Navigation handlers
  const handleSchedulePress = () => {
    if (onSchedulePress) {
      onSchedulePress();
    } else {
      navigation.navigate('Schedule');
    }
  };

  const handleReservePress = () => {
    if (onReservePress) {
      onReservePress();
    } else {
      navigation.navigate('ReserveClassroom');
    }
  };

  const handleNotificationsPress = () => {
    if (onNotificationsPress) {
      onNotificationsPress();
    } else {
      navigation.navigate('Notification');
    }
  };

  const handleProfilePress = () => {
    if (onProfilePress) {
      onProfilePress();
    } else {
      navigation.navigate('Profile');
    }
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }
  };
  const [showNotification, setShowNotification] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const badgeScale = useState(new Animated.Value(1))[0];
  const [totalBadgeCount, setTotalBadgeCount] = useState(0);
  
  // Live unread notifications count for header bell
  useEffect(() => {
    if (!professorId) return;
    const q = query(collection(db, 'notifications'), where('professorId', '==', professorId));
    const unsub = onSnapshot(q, (snap) => {
      let unread = 0;
      snap.forEach((d) => {
        const data = d.data() as any;
        if (!data.read) unread += 1;
      });
      setNotificationCount(unread);
    });
    return () => unsub();
  }, [professorId]);
  const [showApprovedPopup, setShowApprovedPopup] = useState(false);
  const [showDeclinedPopup, setShowDeclinedPopup] = useState(false);
  const [showSubmittedPopup, setShowSubmittedPopup] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [todaySchedule, setTodaySchedule] = useState<ScheduleItem[]>([]);
  const [latestReservation, setLatestReservation] = useState<ReservationItem | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [reservationBadgeCount, setReservationBadgeCount] = useState<number>(0);
  const [substitutionBadgeCount, setSubstitutionBadgeCount] = useState<number>(0);
  const [lastSeenReservationsAt, setLastSeenReservationsAt] = useState<number | null>(null);
  const [lastSeenSubstitutionsAt, setLastSeenSubstitutionsAt] = useState<number | null>(null);
  const [ackedSubstitutionMap, setAckedSubstitutionMap] = useState<Record<string, number>>({});
  const [currentSubstitutionIds, setCurrentSubstitutionIds] = useState<string[]>([]);

  const LAST_SEEN_RES_KEY = 'lastSeenReservationsAt';
  const LAST_SEEN_SUBS_KEY = 'lastSeenSubstitutionsAt';
  const ACK_SUBS_KEY = 'ackedSubstitutionIds';

  // Load current user from session to get the username
  useEffect(() => {
    const loadUser = async () => {
      try {
        const { getCurrentUser } = await import('@/lib/session');
        const user = await getCurrentUser();
        if (user) {
          setCurrentUsername(user.fullName); // This is the requesterName we saved
        }
        const stored = await AsyncStorage.getItem(LAST_SEEN_RES_KEY);
        if (stored) setLastSeenReservationsAt(parseInt(stored, 10));
        const storedSubs = await AsyncStorage.getItem(LAST_SEEN_SUBS_KEY);
        if (storedSubs) setLastSeenSubstitutionsAt(parseInt(storedSubs, 10));
        const storedAcked = await AsyncStorage.getItem(ACK_SUBS_KEY);
        if (storedAcked) {
          try {
            const parsed = JSON.parse(storedAcked) as Record<string, number> | string[];
            // Support both old array format and new map format
            if (Array.isArray(parsed)) {
              // convert array -> map with ack timestamp = now (best-effort)
              const map: Record<string, number> = {};
              const now = Date.now();
              parsed.forEach((id) => { map[id] = now; });
              setAckedSubstitutionMap(map);
            } else {
              setAckedSubstitutionMap(parsed || {});
            }
          } catch (e) {
            console.warn('Failed to parse acked substitutions list', e);
          }
        }
      } catch (e) {
        console.warn('Failed to load session user', e);
      }
    };
    loadUser();
  }, []);

  // Live listener: Load user's reservations (approved, pending, declined)
  useEffect(() => {
    if (!currentUsername) return;
    const q = query(
      collection(db, 'reservations'),
      where('requesterName', '==', currentUsername)
    );
    const unsub = onSnapshot(q, (snap) => {
      const items: ReservationItem[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() as any;
        items.push({
          id: docSnap.id,
          roomName: data.roomName || '',
          dateLabel: data.dateLabel || '',
          timeSlot: data.timeSlot || '',
          status: data.status || 'pending',
          requesterName: data.requesterName || '',
          notes: data.notes || '',
          createdAt: data.createdAt,
        });
      });
      // Sort by createdAt desc to get the latest reservation
      items.sort((a, b) => {
        const aTime = (a as any).createdAt?.toMillis?.() || 0;
        const bTime = (b as any).createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      // Badge count: reservations with status changed (approved/declined) since last seen
      const since = lastSeenReservationsAt ?? 0;
      const nonPendingCount = items.filter((it: any) => {
        const ts = it.createdAt?.toMillis?.() || 0;
        return it.status !== 'pending' && ts > since;
      }).length;
      setReservationBadgeCount(nonPendingCount);
      
  // total will be computed in separate effect (includes substitutions)
      
      // Get the most recent reservation
      if (items.length > 0) {
        setLatestReservation(items[0]);
      } else {
        setLatestReservation(null);
      }
    });
    return () => unsub();
  }, [currentUsername, lastSeenReservationsAt, notificationCount]);

  // Live listener: collect substitution assignment ids for current user and exclude acknowledged ones
  // NOTE: rely on per-entry ids only so new assignments reliably increment the badge
  useEffect(() => {
    if (!currentUsername) return;
    const colRef = collection(db, 'schedules');
    const unsub = onSnapshot(colRef, (snap) => {
      const foundIds: string[] = [];
      // Build a set of currently present substitution ids and capture per-entry updatedAt when available
      const presentIds: string[] = [];
      const entryUpdatedMap: Record<string, number> = {};
      snap.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const scheduleMap = data?.schedule || {};
        Object.keys(scheduleMap).forEach((key: string) => {
          const entry = scheduleMap[key];
          const substituteTeacher = entry?.substituteTeacher;
          if (substituteTeacher === currentUsername) {
            const id = `${docSnap.id}-${key}`;
            presentIds.push(id);
            // Prefer per-entry updatedAt if present, otherwise use doc-level updatedAt
            const entryUpdatedAt = entry?.updatedAt?.toDate?.()?.getTime?.() || data?.updatedAt?.toDate?.()?.getTime?.() || 0;
            entryUpdatedMap[id] = entryUpdatedAt;
          }
        });
      });

      // Compute which present ids should be counted as new (not acknowledged after their latest update)
      presentIds.forEach((id) => {
        const ackTs = ackedSubstitutionMap[id];
        const lastUpdate = entryUpdatedMap[id] || 0;
        if (!ackTs || lastUpdate > ackTs) {
          foundIds.push(id);
        }
      });

      // Prune ackedSubstitutionMap keys that are no longer present in any schedule (optional cleanup)
      const existingAckKeys = Object.keys(ackedSubstitutionMap || {});
      const cleanedAckMap: Record<string, number> = { ...(ackedSubstitutionMap || {}) };
      let cleaned = false;
      existingAckKeys.forEach(k => {
        if (!Object.prototype.hasOwnProperty.call(entryUpdatedMap, k) && !presentIds.includes(k)) {
          // this ack refers to an id that's no longer present; remove it to avoid accumulation
          delete cleanedAckMap[k];
          cleaned = true;
        }
      });
      if (cleaned) {
        setAckedSubstitutionMap(cleanedAckMap);
        AsyncStorage.setItem(ACK_SUBS_KEY, JSON.stringify(cleanedAckMap)).catch(e => console.warn('Failed to persist cleaned ack map', e));
      }
      setCurrentSubstitutionIds(foundIds);
      setSubstitutionBadgeCount(foundIds.length);
    });
    return () => unsub();
  }, [currentUsername, ackedSubstitutionMap]);

  // Compute combined badge count whenever any source changes
  useEffect(() => {
    setTotalBadgeCount(notificationCount + reservationBadgeCount + substitutionBadgeCount);
  }, [notificationCount, reservationBadgeCount, substitutionBadgeCount]);

  // Build today's weekday key and fetch schedule assigned to professor
  const todayShort = useMemo(() => {
    const map = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return map[new Date().getDay()];
  }, []);

  useEffect(() => {
    if (!professorId) return;
    const colRef = collection(db, 'schedules');
    const unsub = onSnapshot(colRef, (snapshot) => {
      const items: ScheduleItem[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as any;
        const scheduleMap = data?.schedule || {};
        const assignments = data?.professorAssignments || {};
        Object.keys(scheduleMap).forEach((key: string) => {
          // Expect keys like 'Monday_7:00AM'
          const [fullDay] = key.split('_');
          const assigned = assignments?.[key];
          if (assigned !== professorId && docSnap.id !== professorId) return;
          // Only include entries that match today's weekday
          const fullToShort: Record<string, string> = { Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat' };
          const shortDay = fullToShort[fullDay] || fullDay.slice(0, 3);
          if (shortDay !== todayShort) return;
          const entry = scheduleMap[key];
          items.push({
            time: `${entry.startTime} - ${entry.endTime}`,
            title: entry.subject || 'Class',
            location: entry.room || '',
            code: entry.sectionName || '',
          });
        });
      });
      // Sort by time
      const toMin = (t?: string) => {
        if (!t) return 0;
        const m = t.match(/(\d+):(\d+)(AM|PM)/i);
        if (!m) return 0;
        let h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        const ap = m[3].toUpperCase();
        if (ap === 'PM' && h !== 12) h += 12;
        if (ap === 'AM' && h === 12) h = 0;
        return h * 60 + min;
      };
      items.sort((a, b) => toMin(a.time.split(' - ')[0]) - toMin(b.time.split(' - ')[0]));
      setTodaySchedule(items);
    }, (e) => {
      console.error('HomeDashboard schedule load error (realtime):', e);
    });
    return () => unsub();
  }, [professorId, todayShort]);

  const getCurrentTime = () => {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const getCurrentDate = () => {
    const now = new Date();
    return now.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const [showDebug, setShowDebug] = useState(false);
  const clearAckedForDebug = async () => {
    try {
      await AsyncStorage.removeItem(ACK_SUBS_KEY);
      setAckedSubstitutionMap({});
    } catch (e) {
      console.warn('Failed to clear acked subs', e);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header with Professor Info */}
        <LinearGradient
          colors={['#FDE68A', '#7DD3FC']}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity style={styles.professorCard} onPress={handleProfilePress}>
              <View style={styles.avatarContainer}>
                <MaterialIcons name="person" size={24} color="#FFFFFF" />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.professorLabel}>Professor</Text>
                <Text style={styles.professorName}>{professorName}</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.headerNotificationButton}
              onPress={() => {
                // Small pulse animation then navigate
                Animated.sequence([
                  Animated.timing(badgeScale, {
                    toValue: 1.2,
                    duration: 120,
                    useNativeDriver: true,
                  }),
                  Animated.timing(badgeScale, {
                    toValue: 1,
                    duration: 120,
                    useNativeDriver: true,
                  }),
                ]).start(async () => {
                  try {
                    // Mark Firestore notifications as read
                    if (professorId) {
                      const qs = await getDocs(query(collection(db, 'notifications'), where('professorId', '==', professorId), where('read', '==', false)));
                      const updates = qs.docs.map((d) => updateDoc(d.ref, { read: true }));
                      await Promise.all(updates);
                    }
                    // Update last seen for reservations
                    const now = Date.now();
                    await AsyncStorage.setItem(LAST_SEEN_RES_KEY, String(now));
                    setLastSeenReservationsAt(now);
                      setReservationBadgeCount(0);
                      // Persist last seen for substitutions as well
                      await AsyncStorage.setItem(LAST_SEEN_SUBS_KEY, String(now));
                      setLastSeenSubstitutionsAt(now);
                      setSubstitutionBadgeCount(0);
                      // Persist acknowledged substitution IDs so they remain cleared after logout/login
                      try {
                        // Re-read schedules once to get the current substitution ids (avoid timing mismatch)
                        const qs = await getDocs(collection(db, 'schedules'));
                        const idsToAck: { id: string; ts: number }[] = [];
                        qs.forEach((docSnap) => {
                          const data = docSnap.data() as any;
                          const scheduleMap = data?.schedule || {};
                          Object.keys(scheduleMap).forEach((key: string) => {
                            const entry = scheduleMap[key];
                            if (entry?.substituteTeacher === currentUsername) {
                              const id = `${docSnap.id}-${key}`;
                              // Prefer per-entry updatedAt when available for ack timestamp comparison later
                              const entryUpdatedAt = entry?.updatedAt?.toDate?.()?.getTime?.() || data?.updatedAt?.toDate?.()?.getTime?.() || Date.now();
                              idsToAck.push({ id, ts: entryUpdatedAt });
                            }
                          });
                        });
                        // merge idsToAck into ackedSubstitutionMap with current or entry timestamp as ack baseline
                        const nowTs = Date.now();
                        const newMap = { ...(ackedSubstitutionMap || {}) };
                        idsToAck.forEach((obj: any) => { newMap[obj.id] = Math.max(obj.ts || nowTs, nowTs); });
                        await AsyncStorage.setItem(ACK_SUBS_KEY, JSON.stringify(newMap));
                        setAckedSubstitutionMap(newMap);
                      } catch (e) {
                        console.warn('Failed to persist acked substitution ids', e);
                      }
                      setTotalBadgeCount(0);
                  } catch (e) {
                    console.warn('Failed to acknowledge notifications', e);
                  } finally {
                    handleNotificationsPress();
                  }
                });
              }}
            >
              <MaterialIcons name="notifications" size={28} color="#FFFFFF" />
              {totalBadgeCount > 0 && (
                <Animated.View style={[styles.headerNotificationBadge, { transform: [{ scale: badgeScale }] }]}>
                  <Text style={styles.headerBadgeText}>{totalBadgeCount}</Text>
                </Animated.View>
              )}
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Main Content */}
        <View style={styles.mainContent}>
          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionButton} onPress={handleSchedulePress}>
                <View style={styles.actionIcon}>
                  <MaterialIcons name="calendar-today" size={24} color="#000" />
                </View>
                <Text style={styles.actionText}>Schedule</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionButton} onPress={handleReservePress}>
                <View style={styles.actionIcon}>
                  <MaterialIcons name="meeting-room" size={24} color="#000" />
                </View>
                <Text style={styles.actionText}>Reserve Classroom</Text>
              </TouchableOpacity>
            </View>

          </View>

          {/* Dashboard Title */}
          <Text style={styles.dashboardTitle}>Dashboard</Text>

          {/* Dynamic Notification Card based on Reservation Status */}
          {latestReservation && latestReservation.status === 'approved' && (
            <TouchableOpacity 
              style={styles.notificationCard}
              onPress={() => setShowModal(true)}
            >
              <Text style={styles.notificationTitle}>Classroom Reservation Approved!</Text>
              <Text style={styles.notificationText}>
                Classroom reservation successful!{'\n'}
                You've successfully reserved <Text style={styles.boldText}>{latestReservation.roomName}</Text> on <Text style={styles.boldText}>{latestReservation.dateLabel}</Text> at{'\n'}
                <Text style={styles.boldText}>{latestReservation.timeSlot}</Text>
              </Text>
            </TouchableOpacity>
          )}

          {latestReservation && latestReservation.status === 'pending' && (
            <View style={[styles.notificationCard, { backgroundColor: '#FEF3C7' }]}>
              <Text style={[styles.notificationTitle, { color: '#92400E' }]}>Classroom Reservation Pending</Text>
              <Text style={styles.notificationText}>
                Your reservation for <Text style={styles.boldText}>{latestReservation.roomName}</Text> on <Text style={styles.boldText}>{latestReservation.dateLabel}</Text> at{'\n'}
                <Text style={styles.boldText}>{latestReservation.timeSlot}</Text> is awaiting approval.
              </Text>
            </View>
          )}

          {latestReservation && latestReservation.status === 'declined' && (
            <View style={[styles.notificationCard, { backgroundColor: '#FEE2E2' }]}>
              <Text style={[styles.notificationTitle, { color: '#991B1B' }]}>Classroom Reservation Declined</Text>
              <Text style={styles.notificationText}>
                Your reservation for <Text style={styles.boldText}>{latestReservation.roomName}</Text> on <Text style={styles.boldText}>{latestReservation.dateLabel}</Text> at{'\n'}
                <Text style={styles.boldText}>{latestReservation.timeSlot}</Text> was not approved.
              </Text>
            </View>
          )}

          {/* Today's Schedule */}
          <View style={styles.scheduleSection}>
            <View style={styles.scheduleHeader}>
              <Text style={styles.todayText}>Today</Text>
              <Text style={styles.dateText}>{getCurrentDate()}</Text>
            </View>

            <View style={styles.scheduleCard}>
              {todaySchedule.length > 0 ? todaySchedule.map((item, index) => (
                <View key={index} style={styles.scheduleItem}>
                  <Text style={styles.scheduleTime}>{item.time}</Text>
                  <View style={styles.scheduleDetails}>
                    <Text style={styles.scheduleTitle}>{item.title}</Text>
                    {item.location && (
                      <Text style={styles.scheduleLocation}>{item.location}</Text>
                    )}
                    {item.code && (
                      <Text style={styles.scheduleCode}>{item.code}</Text>
                    )}
                  </View>
                </View>
              )) : (
                <Text style={{ color: '#6B7280', fontSize: 14 }}>No classes for today</Text>
              )}
            </View>
          </View>
        </View>

        {/* Admin Schedule Modal */}
        <Modal
          visible={showAdminModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowAdminModal(false)}
        >
          <View style={styles.adminModalOverlay}>
            <View style={styles.adminModalContainer}>
              <View style={styles.adminModalHeader}>
                <Text style={styles.adminModalTitle}>Admin & Consultation Schedule</Text>
              </View>
              
              <View style={styles.adminModalContent}>
                <Text style={styles.adminModalQuestion}>
                  Do you want to reject this schedule assignment?
                </Text>
                
                <View style={styles.adminTextArea}>
                  {/* Text area placeholder */}
                </View>
                
                <TouchableOpacity 
                  style={styles.adminSubmitButton}
                  onPress={() => {
                    setShowAdminModal(false);
                    setShowDeclinedPopup(true);
                    // Notification count is driven by Firestore; no local increment here
                    setTimeout(() => setShowDeclinedPopup(false), 3000);
                  }}
                >
                  <Text style={styles.adminSubmitButtonText}>SUBMIT</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Improved Notification Popups */}
        {showApprovedPopup && (
          <View style={styles.improvedNotificationPopup}>
            <View style={styles.improvedPopupContent}>
              <View style={styles.popupIconContainer}>
                <MaterialIcons name="check-circle" size={20} color="#10B981" />
              </View>
              <Text style={styles.improvedPopupText}>You have approved the schedule</Text>
              <TouchableOpacity 
                style={styles.popupCloseButton}
                onPress={() => setShowApprovedPopup(false)}
              >
                <MaterialIcons name="close" size={16} color="#6B7280" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {showDeclinedPopup && (
          <View style={styles.improvedNotificationPopup}>
            <View style={styles.improvedPopupContent}>
              <View style={styles.popupIconContainer}>
                <MaterialIcons name="cancel" size={20} color="#EF4444" />
              </View>
              <Text style={styles.improvedPopupText}>You have declined the schedule</Text>
              <TouchableOpacity 
                style={styles.popupCloseButton}
                onPress={() => setShowDeclinedPopup(false)}
              >
                <MaterialIcons name="close" size={16} color="#6B7280" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {showSubmittedPopup && (
          <View style={styles.improvedNotificationPopup}>
            <View style={styles.improvedPopupContent}>
              <View style={styles.popupIconContainer}>
                <MaterialIcons name="send" size={20} color="#1E40AF" />
              </View>
              <Text style={styles.improvedPopupText}>Successfully submitted</Text>
              <TouchableOpacity 
                style={styles.popupCloseButton}
                onPress={() => setShowSubmittedPopup(false)}
              >
                <MaterialIcons name="close" size={16} color="#6B7280" />
              </TouchableOpacity>
            </View>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  headerGradient: {
    paddingTop: 20,
    paddingBottom: 30,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerNotificationButton: {
    padding: 12,
    position: 'relative',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerNotificationBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  professorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 25,
    flex: 1,
    marginRight: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#667EEA',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#667EEA',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  professorLabel: {
    fontSize: 14,
    color: '#374151',
  },
  professorName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  flex1: {
    flex: 1,
  },
  logoutButton: {
    padding: 8,
    marginLeft: 12,
  },
  mainContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  quickActions: {
    marginBottom: 30,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  actionButton: {
    alignItems: 'center',
    flex: 1,
  },
  actionIcon: {
    width: 60,
    height: 60,
    borderRadius: 15,
    backgroundColor: '#FDE047',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionText: {
    fontSize: 12,
    textAlign: 'center',
    color: '#374151',
    fontWeight: '500',
  },
  dashboardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 20,
  },
  notificationCard: {
    backgroundColor: '#DBEAFE',
    borderRadius: 12,
    padding: 16,
    marginBottom: 25,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 8,
  },
  notificationText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  boldText: {
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 30,
    width: width * 0.85,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalQuestion: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 15,
    textAlign: 'center',
  },
  viewScheduleLink: {
    fontSize: 14,
    color: '#1E40AF',
    textDecorationLine: 'underline',
    marginBottom: 15,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  rejectButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  approveButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  notificationBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  improvedNotificationPopup: {
    position: 'absolute',
    top: 140,
    left: 20,
    right: 20,
    zIndex: 1000,
  },
  improvedPopupContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#1E40AF',
  },
  popupIconContainer: {
    marginRight: 12,
  },
  improvedPopupText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  popupCloseButton: {
    padding: 4,
  },
  notificationIcon: {
    position: 'relative',
  },
  popupBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  feedbackOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedbackPopup: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    margin: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  feedbackText: {
    fontSize: 16,
    fontWeight: 'bold',
    backgroundColor: '#1E40AF',
    color: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 20,
    textAlign: 'center',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 10,
  },
  scheduleButton: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 5,
  },
  reserveButton: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 5,
  },
  notificationButton: {
    alignItems: "center",
    flex: 1,
    marginHorizontal: 5,
  },
  buttonIcon: {
    backgroundColor: '#FDE047',
    borderRadius: 15,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  buttonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  smallNotificationBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  scheduleSection: {
    marginBottom: 100,
  },
  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginBottom: 15,
  },
  todayText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  dateText: {
    fontSize: 16,
    color: '#6B7280',
  },
  scheduleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  scheduleItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  scheduleTime: {
    fontSize: 12,
    color: '#6B7280',
    width: 100,
    fontWeight: '500',
  },
  scheduleDetails: {
    flex: 1,
  },
  scheduleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  scheduleLocation: {
    fontSize: 12,
    color: '#6B7280',
  },
  scheduleCode: {
    fontSize: 12,
    color: '#6B7280',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingVertical: 15,
    paddingHorizontal: 20,
    justifyContent: 'space-around',
  },
  navItem: {
    alignItems: 'center',
    padding: 10,
  },
  adminModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adminModalContainer: {
    width: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    overflow: 'hidden',
  },
  adminModalHeader: {
    backgroundColor: '#1E40AF',
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  adminModalTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  adminModalContent: {
    backgroundColor: '#E3F2FD',
    padding: 20,
  },
  adminModalQuestion: {
    fontSize: 14,
    color: '#000000',
    marginBottom: 15,
  },
  adminTextArea: {
    backgroundColor: '#FFFFFF',
    height: 80,
    borderRadius: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  adminSubmitButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
  },
  adminSubmitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  debugContainer: {
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  debugToggle: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(30,64,175,0.08)',
    borderRadius: 8,
  },
  debugBox: {
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 8,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  debugTitle: {
    fontWeight: '700',
    marginBottom: 6,
  },
  debugText: {
    fontSize: 12,
    color: '#374151',
  },
  debugButton: {
    backgroundColor: '#EF4444',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
});
