import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { HomeDashboard } from '../components/HomeDashboard';
import { ScheduleModule } from '../components/ScheduleModule';
import { ProfileModule } from '../components/ProfileModule';
import { ReserveClassroomModule } from '../components/ReserveClassroomModule';
import { NotificationModule } from '../components/NotificationModule';
import { AdminScheduleModule } from '../components/AdminScheduleModule';
import { LoginArea } from '../components/LoginArea';
import { RootStackParamList } from './types';

const Tab = createBottomTabNavigator<RootStackParamList>();

interface BottomTabNavigatorProps {
  professorName: string;
  professorId: string;
  onLogout: () => void;
}

export function BottomTabNavigator({ professorName, professorId, onLogout }: BottomTabNavigatorProps) {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          height: 70,
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#e5e5e5',
          paddingHorizontal: 40,
          paddingVertical: 8,
          shadowColor: '#000',
          shadowOffset: {
            width: 0,
            height: -2,
          },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 8,
        },
        tabBarItemStyle: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        tabBarActiveTintColor: '#667EEA',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 4,
        },
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Home"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
          tabBarLabel: 'Home',
          tabBarItemStyle: {
            position: 'absolute',
            left: 0,
            width: '33.33%',
            alignItems: 'center',
            justifyContent: 'center',
          },
        }}
      >
        {(props) => <HomeDashboard {...props} professorName={professorName} professorId={professorId} onLogout={onLogout} />}
      </Tab.Screen>
      <Tab.Screen
        name="Schedule"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
          tabBarLabel: 'Schedule',
          tabBarItemStyle: {
            position: 'absolute',
            left: '33.33%',
            width: '33.33%',
            alignItems: 'center',
            justifyContent: 'center',
          },
        }}
      >
        {(props) => <ScheduleModule {...props} professorId={professorId} />}
      </Tab.Screen>
      <Tab.Screen
        name="Profile"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
          tabBarLabel: 'Profile',
          tabBarItemStyle: {
            position: 'absolute',
            right: 0,
            width: '33.33%',
            alignItems: 'center',
            justifyContent: 'center',
          },
        }}
      >
        {(props) => <ProfileModule {...props} professorName={professorName} onLogout={onLogout} />}
      </Tab.Screen>
      <Tab.Screen
        name="ReserveClassroom"
        component={ReserveClassroomModule}
        options={{
          tabBarButton: () => null, // Hide from tab bar
        }}
      />
      <Tab.Screen
        name="Notification"
        
        options={{
          tabBarButton: () => null, // Hide from tab bar
        }}
      >
        {(props) => <NotificationModule {...props} professorId={professorId} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

// expo install @expo/vector-icons