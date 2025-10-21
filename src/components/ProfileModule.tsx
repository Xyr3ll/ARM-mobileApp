import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  StatusBar,
  Platform,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

interface UserProfile {
  id: string;
  fullName: string;
  email?: string;
  department?: string;
  employeeId?: string;
  joinDate?: string;
  profileImage?: string;
}

interface ProfileModuleProps extends NativeStackScreenProps<RootStackParamList, 'Profile'> {
  professorName?: string;
  onBack?: () => void;
  onNotificationPress?: () => void;
  onHomePress?: () => void;
  onSchedulePress?: () => void;
  onProfilePress?: () => void;
  onLogout?: () => void;
}

export const ProfileModule: React.FC<ProfileModuleProps> = ({
  navigation,
  professorName = "Professor",
  onBack,
  onNotificationPress,
  onHomePress,
  onSchedulePress,
  onProfilePress,
  onLogout,
}) => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  
  // Navigation handlers
  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }
    // Note: Login navigation removed as login is now handled outside the navigation context
  };

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

  const handleNotificationPress = () => {
    if (onNotificationPress) {
      onNotificationPress();
    } else {
      navigation.navigate('Notification');
    }
  };

  const handleBackPress = () => {
    if (onBack) {
      onBack();
    } else {
      // Navigate to Home Dashboard
      navigation.navigate('Home');
    }
  };
  const handleLogoutPress = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = () => {
    setShowLogoutModal(false);
    handleLogout();
  };

  const cancelLogout = () => {
    setShowLogoutModal(false);
  };

  // Load user data on component mount
  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    setLoading(true);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) {
        setLoading(false);
        return;
      }
      const db = getFirestore();
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserProfile({
          id: user.uid,
          fullName: data.fullName || professorName,
          email: data.email,
          department: data.department,
          employeeId: data.employeeId,
          joinDate: data.createdAt ? new Date(data.createdAt.seconds * 1000).toISOString().split('T')[0] : undefined,
          profileImage: data.profileImage,
        });
      } else {
        setUserProfile({
          id: user.uid,
          fullName: professorName,
        });
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setUserProfile({
        id: '001',
        fullName: professorName,
      });
    } finally {
      setLoading(false);
    }
  };



  const profileOptions = [
    {
      id: 'help',
      title: 'Help & Support',
      icon: 'help',
      onPress: () => Alert.alert('Help & Support', 'Feature coming soon!'),
    },
    {
      id: 'about',
      title: 'About',
      icon: 'info',
      onPress: () => Alert.alert('About', 'Academic Resource Management System v1.0'),
    },
  ];

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar 
          barStyle="dark-content" 
          backgroundColor="#FFFFFF"
          translucent={false}
          hidden={false}
        />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading Profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar 
        barStyle="dark-content" 
        backgroundColor="#FFFFFF" 
        translucent={false}
        hidden={false}
        networkActivityIndicatorVisible={false}
      />
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity onPress={handleNotificationPress} style={styles.notificationButton}>
            <MaterialIcons name="notifications" size={24} color="#000" />
          </TouchableOpacity>
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <MaterialIcons name="person" size={40} color="#FFFFFF" />
          </View>
          <Text style={styles.professorName}>{userProfile?.fullName || professorName}</Text>
          <Text style={styles.professorTitle}>Professor</Text>
        </View>

        {/* User Details Card */}
        {/* <View style={styles.userDetailsCard}>
          <Text style={styles.sectionTitle}>Contact Information</Text>
          <View style={styles.detailRow}>
            <MaterialIcons name="email" size={20} color="#6B7280" />
            <Text style={styles.detailText}>{userProfile?.email}</Text>
          </View>
          <View style={styles.detailRow}>
            <MaterialIcons name="work" size={20} color="#6B7280" />
            <Text style={styles.detailText}>{userProfile?.department} Department</Text>
          </View>
          <View style={styles.detailRow}>
            <MaterialIcons name="date-range" size={20} color="#6B7280" />
            <Text style={styles.detailText}>Joined: {userProfile?.joinDate}</Text>
          </View>
        </View> */}

        {/* Profile Options */}
        <View style={styles.optionsContainer}>
          {profileOptions.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={styles.optionItem}
              onPress={option.onPress}
            >
              <View style={styles.optionLeft}>
                <View style={styles.optionIconContainer}>
                  <MaterialIcons name={option.icon as any} size={24} color="#1E40AF" />
                </View>
                <Text style={styles.optionTitle}>{option.title}</Text>
              </View>
              <MaterialIcons name="arrow-forward-ios" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout Button */}
        <View style={styles.logoutContainer}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogoutPress}>
            <MaterialIcons name="logout" size={24} color="#EF4444" />
            <Text style={styles.logoutText}>Logout</Text>
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
        <TouchableOpacity style={styles.navItem} onPress={onProfilePress}>
          <MaterialIcons name="person" size={28} color="#1E40AF" />
        </TouchableOpacity>
      </View>

      {/* Logout Confirmation Modal */}
      <Modal
        visible={showLogoutModal}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelLogout}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <MaterialIcons name="logout" size={40} color="#EF4444" />
              <Text style={styles.modalTitle}>Confirm Logout</Text>
            </View>
            
            <Text style={styles.modalMessage}>
              Are you sure you want to logout? You will need to login again to access the system.
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={cancelLogout}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButton} onPress={confirmLogout}>
                <Text style={styles.confirmButtonText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
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
  notificationButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    marginTop: 5,
    marginBottom: 15,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userDetailsCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 15,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailText: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 12,
    fontWeight: '500',
  },
  avatarContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#1E40AF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  professorName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 2,
  },
  professorTitle: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  optionsContainer: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EBF4FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  logoutContainer: {
    margin: 20,
    marginTop: 20,
    marginBottom: 100, // Extra padding for bottom navigation
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: '#FEE2E2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
    marginLeft: 8,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 30,
    margin: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 300,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 12,
  },
  modalMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default ProfileModule;
