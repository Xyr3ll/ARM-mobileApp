import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface AdminScheduleModuleProps {
  onBack: () => void;
  onNotificationPress: () => void;
  onHomePress: () => void;
  onSchedulePress: () => void;
  onProfilePress: () => void;
  onDeclineSubmit?: () => void;
}

export const AdminScheduleModule: React.FC<AdminScheduleModuleProps> = ({
  onBack,
  onNotificationPress,
  onHomePress,
  onSchedulePress,
  onProfilePress,
  onDeclineSubmit,
}) => {
  const [rejectionReason, setRejectionReason] = useState('');

  const handleSubmit = () => {
    console.log('Rejection reason:', rejectionReason);
    // Handle submission logic here
    if (onDeclineSubmit) {
      onDeclineSubmit();
    } else if (onBack) {
      onBack();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <MaterialIcons name="arrow-back-ios" size={20} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerSpacer} />
        <TouchableOpacity onPress={onNotificationPress} style={styles.notificationButton}>
          <MaterialIcons name="notifications" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        <View style={styles.scheduleCard}>
          {/* Header Section */}
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Admin & Consultation Schedule</Text>
          </View>

          {/* Content Section */}
          <View style={styles.cardContent}>
            <Text style={styles.questionText}>
              Do you want to reject this schedule assignment?
            </Text>

            {/* Text Area */}
            <TextInput
              style={styles.textArea}
              placeholder="Enter your reason for rejection..."
              placeholderTextColor="#9CA3AF"
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline={true}
              numberOfLines={6}
              textAlignVertical="top"
            />

            {/* Submit Button */}
            <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
              <Text style={styles.submitButtonText}>SUBMIT</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={onHomePress}>
          <MaterialIcons name="home" size={28} color="#6B7280" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={onNotificationPress}>
          <MaterialIcons name="notifications" size={28} color="#6B7280" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={onSchedulePress}>
          <MaterialIcons name="calendar-today" size={28} color="#1E40AF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={onProfilePress}>
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
  headerSpacer: {
    flex: 1,
  },
  notificationButton: {
    padding: 5,
  },
  mainContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    justifyContent: 'center',
  },
  scheduleCard: {
    backgroundColor: '#DBEAFE',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  cardHeader: {
    backgroundColor: '#1E40AF',
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  cardContent: {
    padding: 30,
  },
  questionText: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 20,
    textAlign: 'left',
    lineHeight: 22,
  },
  textArea: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    padding: 15,
    fontSize: 14,
    color: '#374151',
    height: 120,
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  bottomNav: {
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
  },
});
