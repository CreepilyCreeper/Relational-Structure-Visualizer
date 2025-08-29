const fetchData = async () => {
    try {
        const response = await fetch('./data/community.json');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching community data:', error);
    }
};

export { fetchData };