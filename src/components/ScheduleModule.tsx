import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Modal, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

interface ScheduleItem {
  id: string;
  time: string;
  title: string;
  location?: string;
  code?: string;
  type: 'class' | 'consultation' | 'admin';
}

interface ScheduleModuleProps extends NativeStackScreenProps<RootStackParamList, 'Schedule'> {
  onBack?: () => void;
  onNotificationPress?: () => void;
  onHomePress?: () => void;
  onProfilePress?: () => void;
  showApprovalMessage?: boolean;
  professorId?: string; // username/id to filter schedules
}

export const ScheduleModule: React.FC<ScheduleModuleProps> = ({
  navigation,
  onBack,
  onNotificationPress,
  onHomePress,
  onProfilePress,
  showApprovalMessage = false,
  professorId,
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

  const handleProfilePress = () => {
    if (onProfilePress) {
      onProfilePress();
    } else {
      navigation.navigate('Profile');
    }
  };

  const handleNotificationPress = () => {
    if (onNotificationPress) {
      onNotificationPress();
    } else {
      navigation.navigate('Notification');
    }
  };
  // Default selected day to today's weekday short label
  const todayShort: string = useMemo(() => {
    const idx = new Date().getDay(); // 0 Sun - 6 Sat
    const map = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return map[idx];
  }, []);
  const [selectedDay, setSelectedDay] = useState(todayShort);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [showApprovedMessage, setShowApprovedMessage] = useState(showApprovalMessage);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Firestore state
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduleByDay, setScheduleByDay] = useState<Record<string, ScheduleItem[]>>({});

  // Helper: map full weekday to short label used in UI
  const weekdayMap: Record<string, string> = useMemo(() => ({
    Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat',
  }), []);

  // Real-time schedules for professor from Firestore, merged with nonTeachingHours from faculty
  useEffect(() => {
    if (!professorId) return;
    const normalizedProfessorId = professorId.trim().toLowerCase();
    setLoading(true);
    setError(null);

    const colRef = collection(db, 'schedules');
    const facultyColRef = collection(db, 'faculty');

    // Listen to schedules
    const unsubscribeSchedules = onSnapshot(colRef, (snapshot) => {
      const result: Record<string, ScheduleItem[]> = {};
      let totalDocs = 0;
      let matchedKeys = 0;
      snapshot.forEach((docSnap) => {
        totalDocs += 1;
        const data = docSnap.data() as any;
        const scheduleMap = data?.schedule || {};
        const assignments = data?.professorAssignments || {};
        Object.keys(scheduleMap).forEach((key: string, idx) => {
          const assignedProfessor = assignments?.[key];
          const normAssigned = typeof assignedProfessor === 'string' ? assignedProfessor.trim().toLowerCase() : assignedProfessor;
          const normDocId = String(docSnap.id).trim().toLowerCase();
          const isMatch = normAssigned === normalizedProfessorId || normDocId === normalizedProfessorId;
          if (__DEV__ && !isMatch) {
            try {
              if (assignedProfessor) {
                console.log('[Schedule][match-debug] assigned:', assignedProfessor, 'docId:', docSnap.id, 'normalizedAssigned:', normAssigned, 'normalizedDocId:', normDocId, 'lookingFor:', normalizedProfessorId);
              }
            } catch (e) {}
          }
          if (!isMatch) return;
          const [fullDay] = key.split('_');
          const shortDay = weekdayMap[fullDay] || fullDay.slice(0, 3);
          const entry = scheduleMap[key];
          const timeRange = `${entry.startTime} - ${entry.endTime}`;
          const item: ScheduleItem = {
            id: `${docSnap.id}-${key}-${idx}`,
            time: timeRange,
            title: entry.subject || 'Class',
            location: entry.room,
            code: entry.sectionName,
            type: 'class',
          };
          if (!result[shortDay]) result[shortDay] = [];
          result[shortDay].push(item);
          matchedKeys += 1;
        });
      });

      // Now fetch nonTeachingHours from faculty collection for this professor
      onSnapshot(facultyColRef, (facultySnap) => {
        facultySnap.forEach((facultyDoc) => {
          const facultyData = facultyDoc.data() as any;
          // Match professorId to facultyData.professor (case-insensitive)
          const normFacultyProfessor = facultyData?.professor ? String(facultyData.professor).trim().toLowerCase() : '';
          if (normFacultyProfessor !== normalizedProfessorId) return;
          const nonTeachingHours = facultyData?.nonTeachingHours || [];
          nonTeachingHours.forEach((nth: any, idx: number) => {
            const shortDay = weekdayMap[nth.day] || nth.day.slice(0, 3);
            let timeRange = nth.time;
            if (nth.hours && nth.time) {
              const startMatch = nth.time.match(/(\d+):(\d+)(AM|PM)/i);
              if (startMatch) {
                let h = parseInt(startMatch[1], 10);
                let min = parseInt(startMatch[2], 10);
                const ap = startMatch[3].toUpperCase();
                if (ap === 'PM' && h !== 12) h += 12;
                if (ap === 'AM' && h === 12) h = 0;
                const startMinutes = h * 60 + min;
                const endMinutes = startMinutes + parseInt(nth.hours, 10) * 60;
                let endH = Math.floor(endMinutes / 60);
                let endMin = endMinutes % 60;
                let endAp = endH >= 12 ? 'PM' : 'AM';
                if (endH > 12) endH -= 12;
                if (endH === 0) endH = 12;
                const pad = (n: number) => n < 10 ? `0${n}` : `${n}`;
                timeRange = `${nth.time} - ${pad(endH)}:${pad(endMin)}${endAp}`;
              }
            }
            let type: 'class' | 'consultation' | 'admin' = 'class';
            let displayType = '';
            if (nth.type) {
              const t = String(nth.type).toLowerCase();
              if (t === 'consultation') { type = 'consultation'; displayType = 'Consultation'; }
              else if (t === 'administrative' || t === 'admin') { type = 'admin'; displayType = 'Administrative'; }
            }
            const item: ScheduleItem = {
              id: `${facultyDoc.id}-nth-${shortDay}-${idx}`,
              time: timeRange,
              title: `${displayType}${nth.time ? ` (${timeRange})` : ''}`,
              location: nth.location,
              code: undefined,
              type,
            };
            if (!result[shortDay]) result[shortDay] = [];
            result[shortDay].push(item);
          });
        });

        // Sort each day's items by start time if possible
        const toMinutes = (t?: string) => {
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
        Object.keys(result).forEach(day => {
          result[day].sort((a, b) => toMinutes(a.time.split(' - ')[0]) - toMinutes(b.time.split(' - ')[0]));
        });
        setScheduleByDay(result);
        setLoading(false);
      });
    }, (e) => {
      console.error('Fetch schedule error (realtime):', e);
      setError('Failed to load schedule');
      setLoading(false);
    });

    return () => unsubscribeSchedules();
  }, [professorId, weekdayMap]);

  const currentSchedule = scheduleByDay[selectedDay] || [];

  const getScheduleItemStyle = (type: string) => {
    switch (type) {
      case 'class':
        return styles.classItem;
      case 'consultation':
        return styles.consultationItem;
      case 'admin':
        return styles.adminItem;
      default:
        return styles.classItem;
    }
  };

  const getCurrentDate = () => {
    const d = selectedDate ?? new Date();
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Calendar helpers
  const monthTitle = useMemo(() => {
    return calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [calendarMonth]);

  const daysInMonth = useMemo(() => {
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    return new Date(y, m + 1, 0).getDate();
  }, [calendarMonth]);

  const onSelectCalendarDate = (dayNumber: number) => {
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    const newDate = new Date(y, m, dayNumber);
    const shortMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const short = shortMap[newDate.getDay()];
    setSelectedDate(newDate);
    setSelectedDay(short);
    setShowCalendarModal(false);
  };

  const goPrevMonth = () => {
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    setCalendarMonth(new Date(y, m - 1, 1));
  };

  const goNextMonth = () => {
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    setCalendarMonth(new Date(y, m + 1, 1));
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Schedule</Text>
      </View>


      {/* View Options: calendar and mode toggle (Day / Week) */}
      <View style={styles.viewOptionsRow}>
        <TouchableOpacity style={styles.viewOptions} onPress={() => setShowCalendarModal(true)}>
          <Text style={styles.viewText}>View</Text>
          <MaterialIcons name="keyboard-arrow-down" size={20} color="#6B7280" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.viewModeToggle} onPress={() => setViewMode(prev => prev === 'day' ? 'week' : 'day')}>
          <Text style={styles.viewModeText}>{viewMode === 'day' ? 'Day' : 'Week'}</Text>
        </TouchableOpacity>
      </View>

      {/* Day Navigation */}
      <View style={styles.dayNavigation}>
        {days.map((day) => (
          <TouchableOpacity
            key={day}
            style={[
              styles.dayButton,
              selectedDay === day && styles.selectedDayButton,
            ]}
            onPress={() => setSelectedDay(day)}
          >
            <Text
              style={[
                styles.dayText,
                selectedDay === day && styles.selectedDayText,
              ]}
            >
              {day}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Selected Day Section */}
      <View style={styles.todaySection}>
        <Text style={styles.todayTitle}>Schedule for {selectedDay}</Text>
        <Text style={styles.todayDate}>{getCurrentDate()}</Text>
      </View>

      {/* Schedule List */}
      <ScrollView style={styles.scheduleContainer} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.noClassesText}>Loading schedule…</Text>
          </View>
        ) : error ? (
          <View style={styles.emptyState}>
            <Text style={styles.noClassesText}>{error}</Text>
          </View>
        ) : viewMode === 'day' ? (
          currentSchedule.length > 0 ? (
            currentSchedule.map((item) => (
              <View key={item.id} style={[styles.scheduleItem, getScheduleItemStyle(item.type)]}>
                <View style={styles.timeContainer}>
                  <Text style={styles.timeText}>{item.time}</Text>
                </View>
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
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.noClassesText}>No classes scheduled for {getCurrentDate()}</Text>
            </View>
          )
        ) : (
          // Week view: render each day in order
          days.map((dayShort) => {
            const items = scheduleByDay[dayShort] || [];
            return (
              <View key={`week-${dayShort}`} style={{ marginBottom: 12 }}>
                <View style={styles.weekDayHeader}>
                  <Text style={styles.weekDayHeaderText}>{dayShort}</Text>
                </View>
                {items.length > 0 ? (
                  items.map(item => (
                    <View key={item.id} style={[styles.scheduleItem, getScheduleItemStyle(item.type)]}>
                      <View style={styles.timeContainer}>
                        <Text style={styles.timeText}>{item.time}</Text>
                      </View>
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
                  ))
                ) : (
                  <View style={styles.emptyStateSmall}>
                    <Text style={styles.noClassesTextSmall}>No classes</Text>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Calendar Modal */}
      <Modal
        visible={showCalendarModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCalendarModal(false)}
      >
        <View style={styles.calendarModalOverlay}>
          <View style={styles.calendarModalContainer}>
            <View style={styles.calendarHeader}>
              <Text style={styles.calendarTitle}>Calendar View</Text>
              <TouchableOpacity onPress={() => setShowCalendarModal(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.calendarGrid}>
              <View style={styles.monthHeader}>
                <TouchableOpacity onPress={goPrevMonth} style={styles.monthNavBtn}>
                  <MaterialIcons name="chevron-left" size={24} color="#1E40AF" />
                </TouchableOpacity>
                <Text style={styles.monthText}>{monthTitle}</Text>
                <TouchableOpacity onPress={goNextMonth} style={styles.monthNavBtn}>
                  <MaterialIcons name="chevron-right" size={24} color="#1E40AF" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.weekDays}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <Text key={day} style={styles.weekDayText}>{day}</Text>
                ))}
              </View>
              
              <View style={styles.daysGrid}>
                {(() => {
                  const y = calendarMonth.getFullYear();
                  const m = calendarMonth.getMonth();
                  const firstWeekday = new Date(y, m, 1).getDay(); // 0=Sun
                  const cells: Array<number | null> = [
                    ...Array.from({ length: firstWeekday }, () => null),
                    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
                  ];
                  return cells.map((val, idx) => {
                    if (val === null) {
                      return <View key={`e-${idx}`} style={[styles.dayCell, styles.dayCellEmpty]} />;
                    }
                    const dayNum = val as number;
                    const isSelected = !!(
                      selectedDate &&
                      selectedDate.getFullYear() === y &&
                      selectedDate.getMonth() === m &&
                      selectedDate.getDate() === dayNum
                    );
                    return (
                      <TouchableOpacity key={`d-${dayNum}`} style={[styles.dayCell, isSelected && styles.dayCellSelected]} onPress={() => onSelectCalendarDate(dayNum)}>
                        <Text style={[styles.dayNumber, isSelected && styles.dayNumberSelected]}>{dayNum}</Text>
                      </TouchableOpacity>
                    );
                  });
                })()}
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={handleHomePress}>
          <MaterialIcons name="home" size={28} color="#6B7280" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={handleNotificationPress}>
          <MaterialIcons name="notifications" size={28} color="#6B7280" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <MaterialIcons name="calendar-today" size={28} color="#1E40AF" />
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
  notificationButton: {
    padding: 5,
  },
  viewOptions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  viewText: {
    fontSize: 14,
    color: '#6B7280',
    marginRight: 5,
  },
  dayNavigation: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    borderRadius: 25,
    padding: 5,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dayButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 20,
  },
  selectedDayButton: {
    backgroundColor: '#7DD3FC',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  selectedDayText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  todaySection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  todayTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 5,
  },
  todayDate: {
    fontSize: 14,
    color: '#6B7280',
  },
  scheduleContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 80, // Add padding for bottom navigation
  },
  scheduleItem: {
    flexDirection: 'row',
    marginBottom: 15,
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  classItem: {
    backgroundColor: '#FEF3C7',
  },
  consultationItem: {
    backgroundColor: '#DBEAFE',
  },
  adminItem: {
    backgroundColor: '#F3E8FF',
  },
  timeContainer: {
    marginRight: 15,
    minWidth: 80,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  scheduleDetails: {
    flex: 1,
  },
  scheduleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  scheduleLocation: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  scheduleCode: {
    fontSize: 12,
    color: '#6B7280',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
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
    textAlign: 'center',
  },
  noClassesText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 50,
  },
  calendarModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarModalContainer: {
    width: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    maxHeight: '80%',
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  calendarTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  calendarGrid: {
    padding: 20,
  },
  monthHeader: {
    alignItems: 'center',
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  monthText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E40AF',
  },
  monthNavBtn: {
    padding: 6,
    borderRadius: 6,
  },
  weekDays: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  weekDayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    width: 40,
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  dayCell: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 2,
    borderRadius: 20,
  },
  dayCellEmpty: {
    opacity: 0,
  },
  dayCellSelected: {
    backgroundColor: '#1E40AF',
  },
  dayNumber: {
    fontSize: 16,
    color: '#374151',
  },
  dayNumberSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  viewOptionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  viewModeToggle: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  viewModeText: {
    color: '#1E40AF',
    fontWeight: '600',
  },
  weekDayHeader: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  weekDayHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E40AF',
  },
  emptyStateSmall: {
    paddingVertical: 8,
    paddingLeft: 12,
  },
  noClassesTextSmall: {
    fontSize: 12,
    color: '#6B7280',
  },
});
