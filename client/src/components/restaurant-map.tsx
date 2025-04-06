import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import RestaurantInfoPanel from './restaurant-info-panel';
import { Restaurant } from '@shared/schema';

// Extended Restaurant interface with additional fields needed in the frontend
interface ExtendedRestaurant extends Restaurant {
  chefName?: string;
  season?: number;
}

interface RestaurantMapProps {
  restaurants: Restaurant[];
  selectedCountry: string;
  selectedRestaurant: ExtendedRestaurant | null;
  onSelectRestaurant: (restaurant: ExtendedRestaurant | null) => void;
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
  restaurants: Restaurant[]; 
  selectedRestaurant: ExtendedRestaurant | null; 
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

  // Create custom icon for markers
  const createCustomIcon = (seasonId: number | null) => {
    // Default to "?" if no season ID is available
    const seasonText = seasonId ? `S${seasonId}` : "?";
    
    return L.divIcon({
      className: 'custom-marker',
      html: `<div class="flex items-center justify-center w-8 h-8 bg-red-600 text-white font-bold rounded-full shadow-md border-2 border-white">${seasonText}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
  };

  // Handle close restaurant info
  const handleCloseInfo = () => {
    onSelectRestaurant(null as any);
  };

  return (
    <div className="relative flex-1 overflow-hidden z-10">
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
                  icon={createCustomIcon(restaurant.seasonId)}
                  eventHandlers={{
                    click: () => {
                      // Fetch chef name for the restaurant
                      const fetchChefData = async () => {
                        try {
                          const response = await fetch(`/api/chefs/${restaurant.chefId}`);
                          if (response.ok) {
                            const chef = await response.json();
                            // Expand the restaurant with chef info
                            onSelectRestaurant({
                              ...restaurant,
                              chefName: chef.name,
                              season: restaurant.seasonId || undefined
                            } as ExtendedRestaurant);
                          } else {
                            // Just pass the basic restaurant data
                            onSelectRestaurant({
                              ...restaurant,
                              chefName: "Unknown Chef",
                              season: restaurant.seasonId || undefined
                            } as ExtendedRestaurant);
                          }
                        } catch (error) {
                          console.error("Error fetching chef data:", error);
                          onSelectRestaurant({
                            ...restaurant,
                            chefName: "Unknown Chef",
                            season: restaurant.seasonId || undefined
                          } as ExtendedRestaurant);
                        }
                      };
                      
                      fetchChefData();
                    }
                  }}
                >
                  <Popup>
                    <div className="text-center">
                      <h3 className="font-bold">{restaurant.restaurantName}</h3>
                      <p className="text-sm">{restaurant.city}, {restaurant.country}</p>
                      <p className="text-sm">Season {restaurant.seasonId || "Unknown"}</p>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
          
          {/* Show empty state when no restaurant is selected */}
          {!selectedRestaurant && restaurants.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white shadow-lg rounded-t-lg transform transition-transform duration-300 ease-in-out z-10">
              <div className="text-center p-4">
                <div className="flex justify-center mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                </div>
                <h3 className="text-base font-medium text-gray-900">Select a restaurant</h3>
                <p className="mt-1 text-sm text-gray-500">Tap on a marker to view restaurant details</p>
              </div>
            </div>
          )}
          
          {/* Display restaurant info panel when a restaurant is selected */}
          {selectedRestaurant && (
            <RestaurantInfoPanel
              restaurant={selectedRestaurant}
              selectedCountry={selectedCountry}
              onClose={handleCloseInfo}
            />
          )}
          
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
