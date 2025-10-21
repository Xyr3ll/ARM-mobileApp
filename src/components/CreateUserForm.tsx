import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet } from 'react-native';
 // Import the API function

const CreateUserForm = () => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);



  return (
    <View style={styles.container}>
      <Text style={styles.label}>Enter User Name:</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="User Name"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  label: {
    fontSize: 16,
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    marginBottom: 20,
    borderRadius: 5,
  },
});

export default CreateUserForm;