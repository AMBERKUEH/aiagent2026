const AppHeader = () => {
  return (
    <header className="fixed top-0 w-full z-50 bg-surface-container-lowest flex justify-between items-center px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-surface-container-high overflow-hidden">
          <img
            alt="User profile"
            className="w-full h-full object-cover"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAz_ifBgLE2WXCeEvewmBoJIZ5E-uoXY-XKYsBUngBXymorkNf3-E7JO7_JGc3wdqLe8e8SsZFZLAGFsTT8KjGPsnXnxIb5CBtslvNyXUCQ1IPy5wbpIWOyZByBAcLzwxpcsNjX-YUl4Csx60LwCUgJ5cjTbuuCCDjSphZ6KKNVtAaJPGA-ElOYDKu_OSEtFZduHwCiko4ICcivz6Uq7WxHTQ5ZqU7ctHQGo4Q1hCs1EwO1u1dM6aVvTbWYCYGOYTf1BJfvw-45_cke"
          />
        </div>
        <h1 className="text-xl font-semibold text-primary font-headline tracking-[0.05em]">
          SmartPaddy MY
        </h1>
      </div>
      <button className="w-10 h-10 flex items-center justify-center rounded-full text-primary hover:bg-surface-container-high/50 transition-colors active:scale-95">
        <span className="material-symbols-outlined">notifications</span>
      </button>
    </header>
  );
};

export default AppHeader;
