document.addEventListener('DOMContentLoaded', () => {
    const csvUrl = 'district_data.csv';
    let districtData = [];
    let chartInstance = null;

    const searchInput = document.getElementById('district-search');
    const searchBtn = document.getElementById('search-btn');
    const resultsSection = document.getElementById('results-section');
    const autocompleteList = document.getElementById('autocomplete-list');
    const errorMessage = document.getElementById('error-message');
    const districtNameHeading = document.getElementById('district-name');
    const dataTableBody = document.querySelector('#data-table tbody');
    const ctx = document.getElementById('absenteeChart').getContext('2d');

    // Load CSV Data
    Papa.parse(csvUrl, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            districtData = results.data;
            console.log("Data loaded:", districtData.length, "rows");
        },
        error: function(err) {
            console.error("Error loading CSV:", err);
        }
    });

    // Search Logic
    function performSearch(query) {
        if (!query) return;
        
        // Find exact or closest match
        const result = districtData.find(d => 
            d.clean_name && d.clean_name.toLowerCase() === query.toLowerCase()
        ) || districtData.find(d => 
            d.clean_name && d.clean_name.toLowerCase().includes(query.toLowerCase())
        );

        if (result) {
            displayResults(result);
            errorMessage.classList.add('hidden');
        } else {
            resultsSection.classList.add('hidden');
            errorMessage.classList.remove('hidden');
        }
        closeAllLists();
    }

    // Display Results
    function displayResults(data) {
        resultsSection.classList.remove('hidden');
        districtNameHeading.textContent = data.clean_name;

        // Process data for chart and table
        // CSV columns: clean_name, 20242025, 20232024, etc.
        // We need to extract years and values.
        
        // Dynamic year extraction (excluding 'clean_name')
        const years = Object.keys(data).filter(key => key !== 'clean_name' && key.match(/^\d{8}$/));
        
        // Sort years if needed (assuming descending in CSV, but let's sort ascending for chart)
        years.sort(); // 20192020, 20202021 ...

        const chartLabels = years.map(y => {
            const yStr = String(y);
            return `${yStr.substring(0,4)}-${yStr.substring(4)}`;
        });
        
        const chartData = years.map(y => {
            const val = data[y];
            return (val === 'NA' || val === '' || val === undefined) ? null : parseFloat(val);
        });

        // Update Table
        dataTableBody.innerHTML = '';
        /* 
           Display in reverse chronological order for the table (newest first).
           chartLabels and chartData are currently ascending (oldest first).
        */
        for (let i = chartLabels.length - 1; i >= 0; i--) {
            const row = document.createElement('tr');
            const yearCell = document.createElement('td');
            yearCell.textContent = chartLabels[i];
            const valCell = document.createElement('td');
            const val = chartData[i];
            valCell.textContent = val !== null ? `${val}%` : 'N/A';
            row.appendChild(yearCell);
            row.appendChild(valCell);
            dataTableBody.appendChild(row);
        }

        // Update Chart
        if (chartInstance) {
            chartInstance.destroy();
        }

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartLabels,
                datasets: [{
                    label: 'Chronic Absenteeism Rate (%)',
                    data: chartData,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 3,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#2563eb',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: '#1e293b',
                        titleFont: { family: 'Inter', size: 13 },
                        bodyFont: { family: 'Inter', size: 13 },
                        padding: 10,
                        cornerRadius: 4,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y + '%';
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: '#e2e8f0',
                            borderDash: [5, 5]
                        },
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            },
                            color: '#64748b',
                            font: { family: 'Inter' }
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#64748b',
                            font: { family: 'Inter' }
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }

    // Autocomplete Event Listeners
    searchInput.addEventListener('input', function(e) {
        const val = this.value;
        closeAllLists();
        if (!val) return false;

        const list = document.createElement('div');
        list.setAttribute('id', this.id + 'autocomplete-list');
        list.setAttribute('class', 'autocomplete-items');
        this.parentNode.parentNode.appendChild(list); // Append to .search-section (relative parent)
        
        // Positioning handled by CSS, but ensure parent is relative
        document.querySelector('.search-container').style.position = 'relative';
        document.querySelector('.search-container').appendChild(list);

        let matchCount = 0;
        for (let i = 0; i < districtData.length; i++) {
            const name = districtData[i].clean_name;
            if (name && name.toLowerCase().includes(val.toLowerCase())) {
                const item = document.createElement('div');
                // Highlight match
                const regex = new RegExp(`(${val})`, 'gi');
                item.innerHTML = name.replace(regex, "<strong>$1</strong>");
                item.innerHTML += `<input type='hidden' value='${name}'>`;
                
                item.addEventListener('click', function(e) {
                    searchInput.value = this.getElementsByTagName('input')[0].value;
                    performSearch(searchInput.value);
                    closeAllLists();
                });
                
                list.appendChild(item);
                matchCount++;
                if (matchCount > 10) break; // Limit suggestions
            }
        }
    });

    searchInput.addEventListener('keydown', function(e) {
        // Simple enter key support
        if (e.keyCode === 13) {
            e.preventDefault();
            performSearch(searchInput.value);
            closeAllLists();
        }
    });

    searchBtn.addEventListener('click', () => {
        performSearch(searchInput.value);
    });

    function closeAllLists(elmnt) {
        var x = document.getElementsByClassName("autocomplete-items");
        for (var i = 0; i < x.length; i++) {
            if (elmnt != x[i] && elmnt != searchInput) {
                x[i].parentNode.removeChild(x[i]);
            }
        }
    }

    document.addEventListener("click", function (e) {
        closeAllLists(e.target);
    });
});
