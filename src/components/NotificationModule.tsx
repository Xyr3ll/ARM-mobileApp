import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

interface NotificationItem {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  time?: string;
  timestamp?: number; // Store actual timestamp for sorting
  status?: 'pending' | 'approved' | 'declined';
  source?: 'reservation' | 'substitution';
}

interface NotificationModuleProps extends NativeStackScreenProps<RootStackParamList, 'Notification'> {
  onBack?: () => void;
  onHomePress?: () => void;
  onSchedulePress?: () => void;
  onProfilePress?: () => void;
  showApprovedMessage?: boolean;
  showSubmittedMessage?: boolean;
}

export const NotificationModule: React.FC<NotificationModuleProps> = ({
  navigation,
  onBack,
  onHomePress,
  onSchedulePress,
  onProfilePress,
  showApprovedMessage = false,
  showSubmittedMessage = false,
}) => {
  
  // Back button handler
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigation.goBack();
    }
  };

  // Navigation handlers
  const handleHomePress = () => {
    if (onHomePress) {
      onHomePress();
    } else {
      navigation.navigate('Home');
    }
  };

  const handleSchedulePress = () => {
    if (onSchedulePress) {
      onSchedulePress();
    } else {
      navigation.navigate('Schedule');
    }
  };

  const handleProfilePress = () => {
    if (onProfilePress) {
      onProfilePress();
    } else {
      navigation.navigate('Profile');
    }
  };
  const [showApproved, setShowApproved] = useState(showApprovedMessage);
  const [showSubmitted, setShowSubmitted] = useState(showSubmittedMessage);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [badgeCount, setBadgeCount] = useState<number>(0);
  const [reservationNotifs, setReservationNotifs] = useState<NotificationItem[]>([]);
  const [substitutionNotifs, setSubstitutionNotifs] = useState<NotificationItem[]>([]);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update current time every minute to refresh "time ago" displays
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000); // Update every 60 seconds
    return () => clearInterval(interval);
  }, []);

  // Load current user from session
  useEffect(() => {
    const loadUser = async () => {
      try {
        const { getCurrentUser } = await import('@/lib/session');
        const user = await getCurrentUser();
        if (user) {
          setCurrentUsername(user.fullName);
        }
      } catch (e) {
        console.warn('Failed to load session user', e);
      }
    };
    loadUser();
  }, []);

  // Live listener: Load user's reservations and convert to notifications
  useEffect(() => {
    if (!currentUsername) return;
    const q = query(
      collection(db, 'reservations'),
      where('requesterName', '==', currentUsername)
    );
    const unsub = onSnapshot(q, (snap) => {
      const items: NotificationItem[] = [];
      let newCount = 0;
      
      snap.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const status = data.status || 'pending';
        
        // Count non-pending as new notifications
        if (status === 'approved' || status === 'declined') {
          newCount++;
        }
        
        // Format time ago based on updatedAt
        const updatedAt = data.updatedAt?.toDate?.();
        let timeAgo = 'Just now';
        if (updatedAt) {
          const diffMs = currentTime - updatedAt.getTime();
          const diffMins = Math.floor(diffMs / 60000);
          const diffHours = Math.floor(diffMs / 3600000);
          const diffDays = Math.floor(diffMs / 86400000);
          
          if (diffDays > 0) {
            timeAgo = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
          } else if (diffHours > 0) {
            timeAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
          } else if (diffMins > 0) {
            timeAgo = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
          }
        }

        let type: 'success' | 'info' | 'warning' | 'error' = 'info';
        let title = '';
        let message = '';

        if (status === 'approved') {
          type = 'success';
          title = 'Classroom Reservation Approved!';
          message = `Classroom reservation successful!\nYou've successfully reserved ${data.roomName} on ${data.dateLabel} at\n${data.timeSlot}`;
        } else if (status === 'pending') {
          type = 'warning';
          title = 'Classroom Reservation Pending';
          message = `Your reservation for ${data.roomName} on ${data.dateLabel} at ${data.timeSlot} is awaiting approval.`;
        } else if (status === 'declined') {
          type = 'error';
          title = 'Classroom Reservation Declined';
          message = `Your reservation for ${data.roomName} on ${data.dateLabel} at ${data.timeSlot} was not approved.`;
        }

        items.push({
          id: docSnap.id,
          type,
          title,
          message,
          time: timeAgo,
          timestamp: updatedAt?.getTime() || Date.now(),
          status,
          source: 'reservation',
        });
      });

      // Sort by updatedAt desc
      items.sort((a, b) => {
        const aTime = snap.docs.find(d => d.id === a.id)?.data()?.updatedAt?.toMillis?.() || 0;
        const bTime = snap.docs.find(d => d.id === b.id)?.data()?.updatedAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

      setReservationNotifs(items);
    });
    return () => unsub();
  }, [currentUsername, currentTime]);

  // Live listener: Load substitution assignments for current professor from schedules collection
  useEffect(() => {
    if (!currentUsername) return;
    const colRef = collection(db, 'schedules');
    const unsub = onSnapshot(colRef, (snap) => {
      const items: NotificationItem[] = [];
      
      snap.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const scheduleMap = data?.schedule || {};
        const professorAssignments = data?.professorAssignments || {};
        const program = data?.program || '';
        
        // Loop through each schedule entry to find substituteTeacher assignments
        Object.keys(scheduleMap).forEach((key: string) => {
          const entry = scheduleMap[key];
          const substituteTeacher = entry?.substituteTeacher;
          const originalProfessor = professorAssignments[key]; // Get the original professor
          
          // Check if current user is assigned as substitute
          if (substituteTeacher === currentUsername) {
            // Parse day and time from key (e.g., "Monday_8:30AM")
            const [dayFull, timeStr] = key.split('_');
            
            // Format time ago based on updatedAt
            const updatedAt = data.updatedAt?.toDate?.();
            let timeAgo = 'Just now';
            if (updatedAt) {
              const diffMs = currentTime - updatedAt.getTime();
              const diffMins = Math.floor(diffMs / 60000);
              const diffHours = Math.floor(diffMs / 3600000);
              const diffDays = Math.floor(diffMs / 86400000);
              
              if (diffDays > 0) {
                timeAgo = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
              } else if (diffHours > 0) {
                timeAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
              } else if (diffMins > 0) {
                timeAgo = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
              }
            }

            const title = 'Substitution Assignment';
            const subject = entry.subject || 'a class';
            const section = entry.sectionName || '';
            const room = entry.room || '';
            const startTime = entry.startTime || '';
            const endTime = entry.endTime || '';
            
            let message = `You have been assigned as substitute instructor for ${subject}`;
            if (section) message += ` (${section})`;
            if (originalProfessor) message += `\nSubstituting for: ${originalProfessor}`;
            if (program) message += `\nProgram: ${program}`;
            if (room) message += `\nRoom: ${room}`;
            if (dayFull && startTime && endTime) {
              message += `\nSchedule: ${dayFull} ${startTime} - ${endTime}`;
            }

            items.push({
              id: `${docSnap.id}-${key}`,
              type: 'info',
              title,
              message,
              time: timeAgo,
              timestamp: updatedAt?.getTime() || Date.now(),
              source: 'substitution',
            });
          }
        });
      });

      setSubstitutionNotifs(items);
    });
    return () => unsub();
  }, [currentUsername, currentTime]);

  // Merge reservations and substitutions into combined notifications list
  useEffect(() => {
    const combined = [...reservationNotifs, ...substitutionNotifs];
    
    // Sort by timestamp: newest first (most recent at top)
    combined.sort((a, b) => {
      const aTime = a.timestamp || 0;
      const bTime = b.timestamp || 0;
      return bTime - aTime; // Descending order (newest first)
    });
    
    setNotifications(combined);

    // Calculate badge: approved/declined reservations + substitutions
    const reservationBadge = reservationNotifs.filter(n => n.status === 'approved' || n.status === 'declined').length;
    const substitutionBadge = substitutionNotifs.length;
    setBadgeCount(reservationBadge + substitutionBadge);
  }, [reservationNotifs, substitutionNotifs]);

  useEffect(() => {
    if (showApproved) {
      const timer = setTimeout(() => {
        setShowApproved(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showApproved]);

  useEffect(() => {
    if (showSubmitted) {
      const timer = setTimeout(() => {
        setShowSubmitted(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showSubmitted]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <MaterialIcons name="check-circle" size={24} color="#10B981" />;
      case 'info':
        return <MaterialIcons name="info" size={24} color="#3B82F6" />;
      case 'warning':
        return <MaterialIcons name="warning" size={24} color="#F59E0B" />;
      case 'error':
        return <MaterialIcons name="cancel" size={24} color="#EF4444" />;
      default:
        return <MaterialIcons name="notifications" size={24} color="#6B7280" />;
    }
  };

  const getNotificationStyle = (type: string) => {
    switch (type) {
      case 'success':
        return styles.successNotification;
      case 'info':
        return styles.infoNotification;
      case 'warning':
        return styles.warningNotification;
      case 'error':
        return styles.errorNotification;
      default:
        return styles.defaultNotification;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notification</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Approved Message */}
      {showApproved && (
        <View style={styles.approvedMessage}>
          <Text style={styles.approvedText}>You have approved the schedule</Text>
        </View>
      )}

      {/* Submitted Message */}
      {showSubmitted && (
        <View style={styles.submittedMessage}>
          <Text style={styles.submittedText}>Submitted</Text>
        </View>
      )}

      {/* Notifications List */}
      <ScrollView style={styles.notificationScrollView} showsVerticalScrollIndicator={false}>
        {notifications.map((notification) => (
          <View key={notification.id} style={[styles.notificationItem, getNotificationStyle(notification.type)]}>
            <View style={styles.notificationHeader}>
              {getNotificationIcon(notification.type)}
              <View style={styles.notificationContent}>
                <Text style={styles.notificationTitle}>{notification.title}</Text>
                {notification.time && (
                  <Text style={styles.notificationTime}>{notification.time}</Text>
                )}
              </View>
            </View>
            <Text style={styles.notificationMessage}>{notification.message}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={handleHomePress}>
          <MaterialIcons name="home" size={28} color="#6B7280" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <MaterialIcons name="notifications" size={28} color="#1E40AF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={handleSchedulePress}>
          <MaterialIcons name="calendar-today" size={28} color="#6B7280" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={handleProfilePress}>
          <MaterialIcons name="person" size={28} color="#6B7280" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
   
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E40AF',
    flex: 1,
    marginLeft: 10,
  },
  headerSpacer: {
    width: 34,
  },
  placeholder: {
    width: 34,
  },
  notificationScrollView: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 80, // Add padding for bottom navigation
  },
  notificationItem: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 15,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  successNotification: {
    backgroundColor: '#ECFDF5',
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  infoNotification: {
    backgroundColor: '#EFF6FF',
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  warningNotification: {
    backgroundColor: '#FFFBEB',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  errorNotification: {
    backgroundColor: '#FEE2E2',
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  defaultNotification: {
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 4,
    borderLeftColor: '#6B7280',
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  notificationContent: {
    flex: 1,
    marginLeft: 12,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 12,
    color: '#6B7280',
  },
  notificationMessage: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginLeft: 36,
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
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  navItem: {
    alignItems: 'center',
    padding: 10,
  },
  approvedMessage: {
    backgroundColor: '#10B981',
    margin: 15,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  approvedText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  submittedMessage: {
    backgroundColor: '#3B82F6',
    margin: 15,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  submittedText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
