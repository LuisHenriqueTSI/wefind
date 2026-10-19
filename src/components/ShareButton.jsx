import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';

const ShareButton = ({ item, imageUrl, style }) => {
  const navigation = useNavigation();

  if (!item) return null;

  return (
    <>
      <TouchableOpacity
        onPress={() => navigation.navigate('ShareFlyer', { item, imageUrl })}
        style={[styles.shareMainBtn, style]}
        activeOpacity={0.8}
      >
        <MaterialIcons
          name="share"
          size={22}
          color="#fff"
          style={{ textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}
        />
      </TouchableOpacity>

    </>
  );
};

const styles = StyleSheet.create({
  shareMainBtn: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(30,30,30,0.75)',
    borderRadius: 20,
    padding: 8,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
});

export default ShareButton;
