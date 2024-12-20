export class TutorModeToggle {
    constructor(chatService) {
        this.chatService = chatService;
        this.tutorModeButton = document.getElementById('tutor-mode-button');
        this.tutorModeDropdown = document.getElementById('tutor-mode-dropdown');
        this.dropdownItems = document.querySelectorAll('#tutor-mode-dropdown .dropdown-item');

        this.initEventListeners();
        this.updateCheckmark();
    }

    initEventListeners() {
        this.dropdownItems.forEach(item => {
            item.addEventListener('click', () => {
                const selectedMode = item.getAttribute('data-mode');
                this.chatService.setTutorMode(selectedMode === 'tutor');
                this.updateCheckmark();
                this.tutorModeDropdown.style.display = 'none';
            });
        });
    }

    updateCheckmark() {
        this.dropdownItems.forEach(item => {
            const selectedMode = item.getAttribute('data-mode');
            const checkmark = item.querySelector('.checkmark');
            if ((this.chatService.isTutorModeOn && selectedMode === 'tutor') 
                || (!this.chatService.isTutorModeOn && selectedMode === 'normal')) {
                checkmark.style.display = 'inline';
            } else {
                checkmark.style.display = 'none';
            }
        });
    }
}
