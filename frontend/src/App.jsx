import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import RushDashboard from './pages/RushDashboard';

function App() {
  const { i18n } = useTranslation();

  // Load language preference
  useEffect(() => {
    const savedLang = localStorage.getItem('language');
    if (savedLang) {
      i18n.changeLanguage(savedLang);
    }
  }, []);

  return <RushDashboard />;
}

export default App;
