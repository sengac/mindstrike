import { Settings, User, Bell, Shield, Palette } from 'lucide-react';

export function SettingsPanel() {
  const settingsSections = [
    {
      title: 'Account',
      icon: User,
      items: [
        { label: 'Profile', description: 'Manage your profile information' },
        { label: 'Preferences', description: 'Set your personal preferences' }
      ]
    },
    {
      title: 'Notifications',
      icon: Bell,
      items: [
        { label: 'Email Notifications', description: 'Configure email alerts' },
        { label: 'Push Notifications', description: 'Manage push notification settings' }
      ]
    },
    {
      title: 'Privacy & Security',
      icon: Shield,
      items: [
        { label: 'Data Privacy', description: 'Control your data sharing preferences' },
        { label: 'Security Settings', description: 'Manage authentication and security' }
      ]
    },
    {
      title: 'Appearance',
      icon: Palette,
      items: [
        { label: 'Theme', description: 'Switch between light and dark modes' },
        { label: 'Display', description: 'Adjust display and accessibility settings' }
      ]
    }
  ];

  return (
    <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <Settings size={24} className="text-blue-400" />
          <h1 className="text-xl font-semibold text-white">Settings</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-8">
          {settingsSections.map((section) => (
            <div key={section.title} className="space-y-4">
              <div className="flex items-center gap-3">
                <section.icon size={20} className="text-gray-400" />
                <h2 className="text-lg font-medium text-white">{section.title}</h2>
              </div>
              
              <div className="space-y-3 ml-8">
                {section.items.map((item) => (
                  <div 
                    key={item.label}
                    className="p-4 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors cursor-pointer border border-gray-700"
                  >
                    <h3 className="text-white font-medium">{item.label}</h3>
                    <p className="text-gray-400 text-sm mt-1">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
