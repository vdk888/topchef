import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Restaurant, RestaurantWithDetails } from '@shared/schema'; // Import RestaurantWithDetails

// Remove local type definitions, use the shared one

interface RestaurantMapProps {
  restaurants: RestaurantWithDetails[]; // Use the shared type
  selectedCountry: string;
  selectedRestaurant: RestaurantWithDetails | null; // Use the shared type
  onSelectRestaurant: (restaurant: RestaurantWithDetails | null) => void; // Use the shared type
  isLoading: boolean;
}

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Helper component to handle map updates
const MapController = ({ 
  restaurants, 
  selectedRestaurant 
}: { 
  restaurants: RestaurantWithDetails[]; // Use the shared type
  selectedRestaurant: RestaurantWithDetails | null; // Use the shared type
}) => {
  const map = useMap();
  
  // Update map view when restaurants change
  useEffect(() => {
    if (restaurants.length > 0) {
      const bounds = L.latLngBounds(restaurants.map(r => [Number(r.lat), Number(r.lng)]));
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
    }
  }, [restaurants, map]);

  // Center map on selected restaurant
  useEffect(() => {
    if (selectedRestaurant) {
      map.setView(
        [Number(selectedRestaurant.lat), Number(selectedRestaurant.lng)],
        14,
        { animate: true }
      );
    }
  }, [selectedRestaurant, map]);

  return null;
};

const RestaurantMap = ({
  restaurants,
  selectedCountry,
  selectedRestaurant,
  onSelectRestaurant,
  isLoading
}: RestaurantMapProps) => {
  const [mapReady, setMapReady] = useState<boolean>(false);

// Create custom icon for markers using seasonNumber
  const createCustomIcon = (seasonNumber: number | null) => {
    // Default to "?" if no season number is available
    const seasonText = seasonNumber ? `${seasonNumber}` : "?"; 
    
    // Different colors for different seasons or gray if unknown
    let bgColor = seasonNumber ? 
      `hsl(${(seasonNumber * 30) % 360}, 70%, 50%)` : 
      '#888888';
    
    // Mobile-friendly larger size with improved tap area
    return L.divIcon({
      className: 'custom-marker',
      html: `<div class="flex items-center justify-center w-10 h-10 text-white font-bold rounded-full shadow-md border-2 border-white" style="background-color: ${bgColor}; touch-action: manipulation;">${seasonText}</div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -20]
    });
  };

  // Removed handleCloseInfo as panel rendering is moved to parent

  return (
    <div className="relative flex-1 overflow-hidden z-10" style={{ height: "100%", minHeight: "80vh" }}>
      {isLoading ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-white">
          <div className="text-center">
            <svg className="mx-auto w-12 h-12 text-primary animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="mt-3 text-base font-medium text-gray-900">Loading map...</p>
          </div>
        </div>
      ) : (
        <>
          <MapContainer
            center={[20, 0] as L.LatLngExpression}
            zoom={2}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            whenReady={() => setMapReady(true)}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap contributors</a>'
            />
            
            <ZoomControl position="bottomright" />
            
            <MapController 
              restaurants={restaurants} 
              selectedRestaurant={selectedRestaurant}
            />
            
            {restaurants.map((restaurant) => {
              const position: L.LatLngExpression = [Number(restaurant.lat), Number(restaurant.lng)];
              return (
                <Marker
                  key={restaurant.id}
                  position={position}
                  // Use restaurant.seasonNumber for the icon
                  // Use restaurant.seasonNumber for the icon
                  icon={createCustomIcon(restaurant.seasonNumber)} 
                  eventHandlers={{
                    click: () => {
                      // Define the click handler logic
                      const handleMarkerClick = () => {
                        try {
                          // The 'restaurant' object from the map loop already has chefName
                          // No need to fetch chef again here unless we want to refresh
                          // For now, just pass the existing restaurant object
                          onSelectRestaurant(restaurant); 
                        } catch (error) {
                           // This catch block might not be needed anymore if not fetching
                           // If kept for future refresh logic, handle error appropriately
                          console.error("Error during selection (should not happen if not fetching):", error);
                          // Pass the original restaurant data even on error
                          onSelectRestaurant(restaurant); 
                        }
                      };
                      // Call the simplified handler directly
                      handleMarkerClick();
                    }
                  }}
                >
                  {/* Mobile-friendly popup with larger tap targets */}
                  <Popup>
                    <div className="text-center p-1">
                      <h3 className="font-bold text-sm sm:text-base">{restaurant.restaurantName}</h3>
                      <p className="text-xs sm:text-sm mt-1">{restaurant.city}, {restaurant.country}</p>
                      <p className="text-xs sm:text-sm mt-1">Chef: {restaurant.chefName ?? 'N/A'}</p> {/* Display Chef Name */}
                      <p className="text-xs sm:text-sm mt-1">Season {restaurant.seasonNumber ?? "Unknown"}</p>
                      <button 
                        className="mt-2 w-full text-xs bg-primary text-white py-1.5 px-2 rounded hover:bg-primary/90 active:bg-primary/80 touch-manipulation"
                        onClick={(e) => { // This button click might be redundant if marker click selects
                          e.stopPropagation(); 
                          // Pass the restaurant object directly
                          onSelectRestaurant(restaurant); 
                        }}
                      >
                        View Details
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>

          {/* Empty state and Info Panel rendering moved to Home component */}

          {/* Show message when no restaurants are found */}
          {restaurants.length === 0 && !isLoading && (
            <div className="fixed inset-0 flex items-center justify-center bg-white bg-opacity-80 z-10">
              <div className="text-center p-6 bg-white rounded-lg shadow-md">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-lg font-medium text-gray-900">No restaurants found</h3>
                <p className="mt-1 text-sm text-gray-500">No Top Chef restaurants found in {selectedCountry}</p>
              </div>
            </div>
          )}
        </>
      )}
      
      <style>
        {`
          .custom-marker {
            background: transparent;
            border: none;
          }
          .custom-marker div {
            transition: transform 0.2s ease;
            touch-action: manipulation;
            user-select: none;
          }
          .custom-marker div:hover, .custom-marker div:active {
            transform: scale(1.1);
          }
          .leaflet-marker-icon {
            cursor: pointer;
            user-select: none;
            touch-action: manipulation;
          }
        `}
      </style>
    </div>
  );
};

export default RestaurantMap;
