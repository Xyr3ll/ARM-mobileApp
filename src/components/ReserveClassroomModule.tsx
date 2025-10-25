import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Modal,
  TextInput,
  Alert,
  Dimensions,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { createReservation } from '@/lib/reservations';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

const { width } = Dimensions.get('window');

interface ReserveClassroomModuleProps extends NativeStackScreenProps<RootStackParamList, 'ReserveClassroom'> {
  onBack?: () => void;
  onNotificationPress?: () => void;
  onHomePress?: () => void;
  onSchedulePress?: () => void;
  onProfilePress?: () => void;
  userFullName?: string; // Optional: provide the user's full name for reservation requests
}

export const ReserveClassroomModule: React.FC<ReserveClassroomModuleProps> = ({
  navigation,
  onBack,
  onNotificationPress,
  onHomePress,
  onSchedulePress,
  onProfilePress,
  userFullName,
}) => {
  // Attempt to hydrate userFullName from session if not provided as prop
  const [sessionFullName, setSessionFullName] = useState<string | undefined>(userFullName);
  React.useEffect(() => {
    if (!userFullName) {
      (async () => {
        try {
          const { getCurrentUser } = await import('@/lib/session');
          const user = await getCurrentUser();
          if (user?.fullName) setSessionFullName(user.fullName);
        } catch (e) {
          console.warn('Failed to load session user', e);
        }
      })();
    }
  }, [userFullName]);
  
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

  const handleNotificationPress = () => {
    if (onNotificationPress) {
      onNotificationPress();
    } else {
      navigation.navigate('Notification');
    }
  };
  const [currentScreen, setCurrentScreen] = useState<'available' | 'reserve' | 'feedback'>('available');
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [selectedEnd, setSelectedEnd] = useState<string | null>(null);
  const [showStartDropdown, setShowStartDropdown] = useState(false);
  const [showEndDropdown, setShowEndDropdown] = useState(false);
  const [roomType, setRoomType] = useState<'lecture' | 'laboratory' | 'all'>('all');
  const [feedbackText, setFeedbackText] = useState<string>('');
  const [showSubmittedModal, setShowSubmittedModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<Date | null>(null);
  // Realtime schedules and reservations for availability computation
  const [scheduleDocs, setScheduleDocs] = useState<any[]>([]);
  const [dayReservations, setDayReservations] = useState<any[]>([]);

  // Subscribe to schedules in real-time
  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, 'schedules'), (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setScheduleDocs(docs);
    });
    return () => unsub();
  }, []);

  // Subscribe to reservations for the selected day (pending and approved block availability)
  React.useEffect(() => {
    // clear when no date
    if (!selectedDate) {
      setDayReservations([]);
      return;
    }
    // Two listeners to avoid composite index requirement
    const qPending = query(collection(db, 'reservations'), where('dateLabel', '==', selectedDate), where('status', '==', 'pending'));
    const qApproved = query(collection(db, 'reservations'), where('dateLabel', '==', selectedDate), where('status', '==', 'approved'));
    const combine = (docs: any[]) => docs.map(d => ({ id: d.id, ...d.data() }));
    let pend: any[] = [];
    let appr: any[] = [];
    const unsub1 = onSnapshot(qPending, (snap) => {
      pend = combine(snap.docs as any);
      setDayReservations([...
        pend,
        ...appr
      ]);
    });
    const unsub2 = onSnapshot(qApproved, (snap) => {
      appr = combine(snap.docs as any);
      setDayReservations([...
        pend,
        ...appr
      ]);
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, [selectedDate]);

  // Helpers
  const toMinutes = (t?: string) => {
    if (!t) return 0;
    const clean = t.replace(/\s/g, '');
    const m = clean.match(/(\d+):(\d+)(AM|PM)/i);
    if (!m) return 0;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ap = m[3].toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return h * 60 + min;
  };
  const rangesOverlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) => {
    return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
  };

  const inferRoomType = (roomName: string): 'lecture' | 'laboratory' => {
    return /lab/i.test(roomName) ? 'laboratory' : 'lecture';
  };

  // Generate 30-minute slots within working ranges (keeps lunch gap 12:00-1:00)
  const timeSlots: string[] = React.useMemo(() => {
    const ranges = [
      { startHour: 7, endHour: 12 }, // 7:00 - 12:00 (last slot 11:30-12:00)
      { startHour: 13, endHour: 17 }, // 1:00 - 17:00 (last slot 16:30-17:00)
    ];
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const format = (minutes: number) => {
      let h = Math.floor(minutes / 60);
      const m = minutes % 60;
      const ap = h >= 12 ? 'PM' : 'AM';
      if (h > 12) h = h - 12;
      if (h === 0) h = 12;
      return `${h}:${pad(m)} ${ap}`;
    };
    const slots: string[] = [];
    ranges.forEach(r => {
      for (let m = r.startHour * 60; m < r.endHour * 60; m += 30) {
        const s = format(m);
        const e = format(m + 30);
        slots.push(`${s} - ${e}`);
      }
    });
    return slots;
  }, [/* static */]);

  // derive simple start/end lists from timeSlots (30-minute granularity)
  const startOptions = React.useMemo(() => timeSlots.map(s => s.split(' - ')[0]), [timeSlots]);
  const endOptions = React.useMemo(() => timeSlots.map(s => s.split(' - ')[1]), [timeSlots]);

  // compute occupancy array for a given room on the selected date
  const computeOccupancyForRoom = (roomName: string) => {
    const occ: Array<{ start: number; end: number }> = [];
    // schedules
    scheduleDocs.forEach((doc: any) => {
      const scheduleMap = doc?.schedule || {};
      Object.keys(scheduleMap).forEach((key: string) => {
        const [fullDay] = key.split('_');
        const mapFullToShort: Record<string, string> = { Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat' };
        const short = mapFullToShort[fullDay] || fullDay.slice(0, 3);
        const entry = scheduleMap[key];
        const room = entry?.room;
        if (!room) return;
        if (room !== roomName) return;
        if (!calendarSelectedDate) return;
        const shortMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayShort = shortMap[calendarSelectedDate.getDay()];
        if (short !== dayShort) return;
        const start = toMinutes(entry.startTime);
        const end = toMinutes(entry.endTime);
        occ.push({ start, end });
      });
    });

    // approved reservations
    dayReservations.forEach((res: any) => {
      if (res.status !== 'approved') return;
      if (res.roomName !== roomName) return;
      const slot: string = res.timeSlot;
      if (!slot) return;
      const [s, e] = slot.split(' - ').map((x: string) => x.trim());
      const start = toMinutes(s);
      const end = toMinutes(e);
      occ.push({ start, end });
    });

    return occ;
  };

  const isIntervalFreeForRoom = (roomName: string, startMin: number, endMin: number) => {
    const occ = computeOccupancyForRoom(roomName);
    return !occ.some(r => rangesOverlap(startMin, endMin, r.start, r.end));
  };

  // Given a selectedStart (like '9:00 AM'), return an array of end times
  // that keep the entire interval inside contiguous freeSlotsForSelectedRoom
  const getEndOptionsForStart = (start: string | null) => {
    if (!start || !selectedRoom) return [];
    const slots = freeSlotsForSelectedRoom.map(slot => {
      const [s, e] = slot.split(' - ').map(x => x.trim());
      return { s, e, sMin: toMinutes(s), eMin: toMinutes(e) };
    }).sort((a, b) => a.sMin - b.sMin);

    const startMin = toMinutes(start);
    const startIdx = slots.findIndex(sl => sl.sMin === startMin);
    if (startIdx === -1) return [];

    const ends: string[] = [];
    let curEndMin = slots[startIdx].eMin;
    ends.push(slots[startIdx].e);
    let j = startIdx + 1;
    while (j < slots.length && slots[j].sMin === curEndMin) {
      // contiguous slot
      curEndMin = slots[j].eMin;
      ends.push(slots[j].e);
      j++;
    }
    return Array.from(new Set(ends));
  };

  // Simple modal dropdown component
  const ModalDropdown: React.FC<{
    visible: boolean;
    title?: string;
    options: string[];
    onClose: () => void;
    onSelect: (val: string) => void;
  }> = ({ visible, title, options, onClose, onSelect }) => (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.submittedOverlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.submittedPopup, { width: width - 60, maxHeight: 400 }]}>
          {title && <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 10 }}>{title}</Text>}
          <ScrollView>
            {options.map(opt => (
              <TouchableOpacity key={opt} style={{ paddingVertical: 12 }} onPress={() => { onSelect(opt); onClose(); }}>
                <Text style={{ fontSize: 16 }}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  // Compute availability for selected date from schedules and reservations
  type DerivedRoom = { name: string; type: 'lecture' | 'laboratory'; freeSlots: string[] };
  const derivedRooms: DerivedRoom[] = React.useMemo(() => {
    if (!calendarSelectedDate) return [];
    // weekday short
    const shortMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayShort = shortMap[calendarSelectedDate.getDay()];

    // Build occupancy by room from schedules for that weekday and collect all rooms seen
    const occupancy: Record<string, Array<{ start: number; end: number }>> = {};
    const roomsSet = new Set<string>();

    scheduleDocs.forEach((doc: any) => {
      const scheduleMap = doc?.schedule || {};
      Object.keys(scheduleMap).forEach((key: string) => {
        const [fullDay] = key.split('_');
        const mapFullToShort: Record<string, string> = { Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat' };
        const short = mapFullToShort[fullDay] || fullDay.slice(0, 3);
        const entry = scheduleMap[key];
        const room = entry?.room;
        if (!room) return;
        // Always collect the room even if schedule not for this weekday (we want to show all rooms)
        roomsSet.add(room);
        if (short !== dayShort) return; // only block slots from schedules that fall on the selected weekday
        const start = toMinutes(entry.startTime);
        const end = toMinutes(entry.endTime);
        if (!occupancy[room]) occupancy[room] = [];
        occupancy[room].push({ start, end });
      });
    });

    // Add only approved reservations occupancy for that day and collect rooms from reservations
    dayReservations.forEach((res: any) => {
      if (res.status !== 'approved') return; // Only block slots for approved reservations
      const room = res.roomName;
      const slot: string = res.timeSlot;
      if (!room) return;
      roomsSet.add(room);
      if (!slot) return;
      const [s, e] = slot.split(' - ').map(x => x.trim());
      const start = toMinutes(s);
      const end = toMinutes(e);
      if (!occupancy[room]) occupancy[room] = [];
      occupancy[room].push({ start, end });
    });

    // Also include rooms that may exist in scheduleDocs but had no entries for the selected weekday
    // (roomsSet already contains them because we collected above)

    const rooms = Array.from(roomsSet);
    const makeSlotRange = (slot: string) => {
      const [s, e] = slot.split(' - ').map(x => x.trim());
      return { s: toMinutes(s), e: toMinutes(e) };
    };

    const result: DerivedRoom[] = rooms.map((roomName) => {
      const occ = occupancy[roomName] || [];
      const free = timeSlots.filter((slot) => {
        const { s, e } = makeSlotRange(slot);
        return !occ.some(r => rangesOverlap(s, e, r.start, r.end));
      });
      return { name: roomName, type: inferRoomType(roomName), freeSlots: free };
    }).sort((a, b) => a.name.localeCompare(b.name));

    return result;
  }, [calendarSelectedDate, scheduleDocs, dayReservations]);

  // Apply room type filter to derived rooms
  const filteredRooms = React.useMemo(() => {
    const rooms = derivedRooms.filter(r => r.freeSlots.length > 0);
    if (roomType === 'all') return rooms;
    return rooms.filter(r => r.type === roomType);
  }, [derivedRooms, roomType]);

  // Get free slots for selected room
  const freeSlotsForSelectedRoom = React.useMemo(() => {
    if (!selectedRoom) return [];
    const found = derivedRooms.find(r => r.name === selectedRoom);
    return found?.freeSlots || [];
  }, [derivedRooms, selectedRoom]);

  // Reservation window: today to next 7 days only
  const isWithinReservationWindow = (d: Date) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const end = new Date(today);
    end.setDate(end.getDate() + 7);
    const test = new Date(d);
    test.setHours(0,0,0,0);
    return test >= today && test <= end;
  };

  const handleSubmitFeedback = async () => {
    // Basic validation
    if (!selectedRoom) {
      Alert.alert('Missing info', 'Please select a room.');
      return;
    }
    if (!calendarSelectedDate) {
      Alert.alert('Missing info', 'Please select a date on the calendar.');
      return;
    }
    if (!selectedTimeSlot) {
      Alert.alert('Missing info', 'Please choose a time slot.');
      return;
    }
    // Notes are optional now; do not block submission if empty
    // Enforce reservation window
    if (!isWithinReservationWindow(calendarSelectedDate)) {
      Alert.alert('Not allowed', 'You can only reserve for today up to 7 days ahead.');
      return;
    }
    // Prevent race condition: verify slot still free
    const taken = dayReservations.some((r: any) => r.roomName === selectedRoom && r.timeSlot === selectedTimeSlot && (r.status === 'pending' || r.status === 'approved'));
    if (taken) {
      Alert.alert('Slot unavailable', 'Sorry, this time slot was just taken. Please choose another.');
      return;
    }

    try {
      setSubmitting(true);
      const id = await createReservation({
        roomName: selectedRoom,
        roomType,
        dateLabel: selectedDate,
        dateISO: calendarSelectedDate?.toISOString(),
        timeSlot: selectedTimeSlot,
        notes: feedbackText.trim(),
        requesterName: (sessionFullName || userFullName || null) as string | null,
      });

      setShowSubmittedModal(true);
      // Auto close after a brief delay
      setTimeout(() => {
        setShowSubmittedModal(false);
        setCurrentScreen('available');
        // Reset form
        setSelectedRoom(null);
        setSelectedDate('');
        setSelectedTimeSlot(null);
        setFeedbackText('');
      }, 1500);
    } catch (err: any) {
      console.error('Failed to create reservation:', err);
      Alert.alert('Submission failed', err?.message || 'Please try again later.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAttachFile = () => {
    // attachment feature removed
  };

  const selectDate = (date: Date) => {
    if (!isWithinReservationWindow(date)) {
      Alert.alert('Not allowed', 'You can only reserve for today up to 7 days ahead.');
      return;
    }
    setCalendarSelectedDate(date);
    const formattedDate = date.toLocaleDateString();
    setSelectedDate(formattedDate);
    // Reset selection when date changes
    setSelectedRoom(null);
    setSelectedTimeSlot(null);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newMonth = new Date(currentMonth);
    if (direction === 'prev') {
      newMonth.setMonth(currentMonth.getMonth() - 1);
    } else {
      newMonth.setMonth(currentMonth.getMonth() + 1);
    }
    setCurrentMonth(newMonth);
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days: (Date | null)[] = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  };

  const isSelected = (date: Date) => {
    return date && calendarSelectedDate && date.getDate() === calendarSelectedDate.getDate() && date.getMonth() === calendarSelectedDate.getMonth() && date.getFullYear() === calendarSelectedDate.getFullYear();
  };

  const renderAvailableRooms = () => (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Available Rooms</Text>
          <TouchableOpacity onPress={handleNotificationPress}>
            <MaterialIcons name="notifications" size={24} color="#000" />
          </TouchableOpacity>
        </View>

        {/* Calendar Section */}
        <View style={styles.calendarSection}>
          <Text style={styles.sectionTitle}>Select Date</Text>
          
          {/* Month Navigation */}
          <View style={styles.monthNavigation}>
            <TouchableOpacity onPress={() => navigateMonth('prev')} style={styles.monthNavButton}>
              <MaterialIcons name="chevron-left" size={24} color="#1E40AF" />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>
              {currentMonth.toLocaleString('default', { month: 'long' })} {currentMonth.getFullYear()}
            </Text>
            <TouchableOpacity onPress={() => navigateMonth('next')} style={styles.monthNavButton}>
              <MaterialIcons name="chevron-right" size={24} color="#1E40AF" />
            </TouchableOpacity>
          </View>
          
          {/* Calendar Grid */}
          <View style={styles.calendarContainer}>
            {/* Day headers */}
            <View style={styles.dayHeadersRow}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <Text key={day} style={styles.dayHeader}>{day}</Text>
              ))}
            </View>
            
            {/* Calendar days */}
            <View style={styles.calendarGrid}>
              {getDaysInMonth(currentMonth).map((date: Date | null, index: number) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.calendarDay,
                    !date && styles.emptyDay,
                    date && isToday(date) && styles.todayDay,
                    date && isSelected(date) && styles.selectedDay,
                    date && !isWithinReservationWindow(date) && styles.disabledDay,
                  ]}
                  onPress={() => date && selectDate(date)}
                  disabled={!date || (date && !isWithinReservationWindow(date))}
                >
                  {date && (
                    <Text style={[
                      styles.calendarDayText,
                      isToday(date) && styles.todayDayText,
                      isSelected(date) && styles.selectedDayText,
                      !isWithinReservationWindow(date) && styles.disabledDayText,
                    ]}>
                      {date.getDate()}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
        
        {/* Room Type Filter */}
        <View style={styles.filterContainer}>
          <Text style={styles.sectionTitle}>Room Type</Text>
          <View style={styles.filterButtons}>
            <TouchableOpacity
              style={[
                styles.filterButton,
                roomType === 'lecture' && styles.activeFilterButton,
              ]}
              onPress={() => setRoomType('lecture')}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  roomType === 'lecture' && styles.activeFilterButtonText,
                ]}
              >
                Lecture Rooms
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterButton,
                roomType === 'laboratory' && styles.activeFilterButton,
              ]}
              onPress={() => setRoomType('laboratory')}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  roomType === 'laboratory' && styles.activeFilterButtonText,
                ]}
              >
                Laboratory
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Available Rooms List */}
        <View style={styles.roomList}>
          <Text style={styles.sectionTitle}>
            Available Rooms {calendarSelectedDate && `for ${calendarSelectedDate.toLocaleDateString()}`}
          </Text>
          {calendarSelectedDate ? (
            filteredRooms.length > 0 ? (
              filteredRooms.map((room) => (
              <TouchableOpacity
                key={room.name}
                style={styles.roomCard}
                onPress={() => {
                  setSelectedRoom(room.name);
                  setRoomType(room.type);
                  setSelectedStart(null);
                  setSelectedEnd(null);
                  setSelectedTimeSlot(null);
                  setCurrentScreen('reserve');
                }}
              >
                <View style={styles.roomInfo}>
                  <Text style={styles.roomName}>{room.name}</Text>
                  <Text style={styles.roomTypeText}>Type: {room.type === 'laboratory' ? 'Laboratory' : 'Lecture'}</Text>
                  <Text style={styles.freeText}>Free: {room.freeSlots.slice(0, 3).join(', ')}{room.freeSlots.length > 3 ? '…' : ''}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={24} color="#6B7280" />
              </TouchableOpacity>
              ))
            ) : (
              <View style={styles.roomCard}>
                <Text style={styles.roomName}>No rooms available for the selected date</Text>
              </View>
            )
          ) : (
            <View style={styles.roomCard}>
              <Text style={styles.roomName}>Please select a date to see available rooms</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={handleHomePress}>
          <MaterialIcons name="home" size={28} color="#6B7280" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={handleNotificationPress}>
          <MaterialIcons name="notifications" size={28} color="#6B7280" />
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

  const renderReserveRoom = () => (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setCurrentScreen('available')} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Reserve Room</Text>
          <TouchableOpacity onPress={handleNotificationPress}>
            <MaterialIcons name="notifications" size={24} color="#000" />
          </TouchableOpacity>
        </View>

        {/* Room Layout Image */}
        <View style={styles.roomLayoutContainer}>
          <View style={styles.roomLayoutImageContainer}>
            <Image 
              source={roomType === 'laboratory' ? 
                require('../../assets/LAB.png') : 
                require('../../assets/Room 1.png')
              }
              style={styles.roomLayoutImage}
              resizeMode="contain"
            />
          </View>
          <View style={styles.roomInfoCard}>
            <Text style={styles.roomTitle}>
              {selectedRoom}
            </Text>
          </View>
        </View>

        {/* Time Slots Selection */}
        <View style={styles.timeSlotsSection}>
          <Text style={styles.sectionTitle}>Choose Time</Text>
          <View style={{ paddingHorizontal: 20 }}>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => setShowStartDropdown(true)}
              disabled={!selectedRoom}
            >
              <Text style={styles.dropdownButtonText}>{selectedStart || 'TIME START'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.dropdownButton, !selectedStart && styles.disabledButton]}
              onPress={() => setShowEndDropdown(true)}
              disabled={!selectedStart}
            >
              <Text style={styles.dropdownButtonText}>{selectedEnd || 'TIME END'}</Text>
            </TouchableOpacity>
          </View>

          {/* No free slots message when room has none */}
          {freeSlotsForSelectedRoom.length === 0 && (
            <View style={styles.noSlotsContainer}>
              <Text style={styles.noSlotsText}>No free slots for this room on the selected date.</Text>
            </View>
          )}

          {/* Dropdown modals */}
          <ModalDropdown
            visible={showStartDropdown}
            title="Select Start Time"
            options={Array.from(new Set(freeSlotsForSelectedRoom.map(s => s.split(' - ')[0])))}
            onClose={() => setShowStartDropdown(false)}
            onSelect={(val) => { setSelectedStart(val); setSelectedEnd(null); }}
          />
          <ModalDropdown
            visible={showEndDropdown}
            title="Select End Time"
            options={selectedStart ? getEndOptionsForStart(selectedStart) : []}
            onClose={() => setShowEndDropdown(false)}
            onSelect={(val) => { setSelectedEnd(val); }}
          />
        </View>


        {/* Next Button */}
        <TouchableOpacity
          style={[
            styles.nextButton,
            (!selectedStart || !selectedEnd || !selectedRoom) && styles.disabledButton,
          ]}
          onPress={() => {
            if (!selectedStart || !selectedEnd) return;
            if (!selectedRoom) { Alert.alert('Missing info', 'Please select a room.'); return; }
            const sMin = toMinutes(selectedStart);
            const eMin = toMinutes(selectedEnd);
            if (eMin <= sMin) { Alert.alert('Invalid range', 'End time must be after start time.'); return; }
            if (!isIntervalFreeForRoom(selectedRoom, sMin, eMin)) {
              Alert.alert('Slot unavailable', 'Sorry, this time range is not available.');
              return;
            }
            setSelectedTimeSlot(`${selectedStart} - ${selectedEnd}`);
            setCurrentScreen('feedback');
          }}
          disabled={!selectedStart || !selectedEnd || !selectedRoom}
        >
          <Text style={styles.nextButtonText}>NEXT</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={handleHomePress}>
          <MaterialIcons name="home" size={28} color="#6B7280" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={handleNotificationPress}>
          <MaterialIcons name="notifications" size={28} color="#6B7280" />
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

  const renderFeedback = () => (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setCurrentScreen('reserve')} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Feedback</Text>
          <TouchableOpacity onPress={handleNotificationPress}>
            <MaterialIcons name="notifications" size={24} color="#000" />
          </TouchableOpacity>
        </View>

        {/* Feedback Header */}
        <View style={styles.feedbackHeaderCard}>
          <Text style={styles.feedbackTitle}>Feedback</Text>
        </View>

        {/* Feedback Form */}
        <View style={styles.feedbackContainer}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>From Room</Text>
            <View style={styles.roomSelector}>
              <Text style={styles.roomSelectorText}>{selectedRoom}</Text>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Enter your notes here..."
              multiline
              numberOfLines={4}
              value={feedbackText}
              onChangeText={setFeedbackText}
            />
          </View>
          <TouchableOpacity style={[styles.submitButton, submitting && styles.disabledButton]} onPress={handleSubmitFeedback} disabled={submitting}>
            <Text style={styles.submitButtonText}>{submitting ? 'SUBMITTING...' : 'SUBMIT'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={handleHomePress}>
          <MaterialIcons name="home" size={28} color="#6B7280" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={handleNotificationPress}>
          <MaterialIcons name="notifications" size={28} color="#6B7280" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={handleSchedulePress}>
          <MaterialIcons name="calendar-today" size={28} color="#6B7280" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={handleProfilePress}>
          <MaterialIcons name="person" size={28} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {/* Submitted Modal */}
      <Modal
        visible={showSubmittedModal}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.submittedOverlay}>
          <View style={styles.submittedPopup}>
            <MaterialIcons name="check-circle" size={60} color="#10B981" />
            <Text style={styles.submittedText}>Successfully Submitted!</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );

  // Main render function
  switch (currentScreen) {
    case 'available':
      return renderAvailableRooms();
    case 'reserve':
      return renderReserveRoom();
    case 'feedback':
      return renderFeedback();
    default:
      return renderAvailableRooms();
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  roomTypeContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 15,
    gap: 10,
  },
  roomTypeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
  },
  selectedRoomType: {
    backgroundColor: '#1E40AF',
    borderColor: '#1E40AF',
  },
  roomTypeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  selectedRoomTypeText: {
    color: '#FFFFFF',
  },
  roomList: {
    paddingHorizontal: 20,
  },
  roomCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  roomInfo: {
    flex: 1,
  },
  roomName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  
  freeText: {
    fontSize: 12,
    color: '#374151',
    marginTop: 2,
  },
  selectedRoomCard: {
    margin: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  roomLayoutContainer: {
    margin: 20,
  },
  roomLayoutImageContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  roomLayoutImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
  },
  roomInfoCard: {
    backgroundColor: '#1E40AF',
    borderRadius: 8,
    padding: 15,
    marginTop: 5,
  },
  roomTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  dateSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 10,
  },
  dateInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#374151',
  },
  timeSlotsSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  timeSlotsScrollContainer: {
    paddingRight: 20,
  },
  timeSlotsContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  timeSlot: {
    flex: 1,
    backgroundColor: '#7DD3FC',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  timeSlotCard: {
    backgroundColor: '#7DD3FC',
    borderRadius: 8,
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    minWidth: 100,
  },
  selectedTimeSlot: {
    backgroundColor: '#FDE047',
  },
  timeSlotText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    textAlign: 'center',
  },
  selectedTimeSlotText: {
    color: '#000000',
  },
  noSlotsContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  noSlotsText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  nextButton: {
    backgroundColor: '#FDE047',
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
  },
  feedbackHeaderCard: {
    backgroundColor: '#1E40AF',
    margin: 20,
    marginBottom: 10,
    borderRadius: 12,
    padding: 16,
  },
  feedbackTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  feedbackContainer: {
    backgroundColor: '#7DD3FC',
    margin: 20,
    marginTop: 0,
    borderRadius: 12,
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  roomSelector: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  roomSelectorText: {
    fontSize: 16,
    color: '#374151',
  },
  textArea: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#374151',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  attachButton: {
    backgroundColor: '#1E40AF',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  attachButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  submitButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  // Calendar styles
  calendarSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  monthNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  monthNavButton: {
    padding: 8,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E40AF',
  },
  calendarContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dayHeadersRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#6B7280',
    paddingVertical: 5,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  emptyDay: {
    backgroundColor: 'transparent',
  },
  todayDay: {
    backgroundColor: '#FDE047',
    borderRadius: 20,
  },
  selectedDay: {
    backgroundColor: '#1E40AF',
    borderRadius: 20,
  },
  disabledDay: {
    opacity: 0.4,
  },
  calendarDayText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  todayDayText: {
    color: '#000000',
    fontWeight: 'bold',
  },
  selectedDayText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  disabledDayText: {
    color: '#9CA3AF',
  },
  // Filter styles
  filterContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  filterButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  filterButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  activeFilterButton: {
    backgroundColor: '#1E40AF',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  activeFilterButtonText: {
    color: '#FFFFFF',
  },
  dropdownButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
    alignItems: 'center',
  },
  dropdownButtonText: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '600',
  },
  // No rooms message
  noRoomsContainer: {
    padding: 20,
    alignItems: 'center',
  },
  noRoomsText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  navItem: {
    alignItems: 'center',
    padding: 10,
  },
  submittedOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  submittedPopup: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  submittedText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    textAlign: 'center',
  },
});

export default ReserveClassroomModule;
