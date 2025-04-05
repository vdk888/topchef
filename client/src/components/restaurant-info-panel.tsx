import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Restaurant } from "@shared/schema";

interface RestaurantInfoPanelProps {
  restaurant: Restaurant;
  selectedCountry: string;
  onClose: () => void;
}

const RestaurantInfoPanel = ({ 
  restaurant, 
  selectedCountry, 
  onClose 
}: RestaurantInfoPanelProps) => {
  const handleGetDirections = () => {
    const { lat, lng, restaurantName } = restaurant;
    alert(`Opening directions to ${restaurantName}`);
    // In a production app, this would use the device's maps application
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-xs bg-white shadow-lg z-10 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-bold">{restaurant.restaurantName}</h2>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
      
      <div className="flex-1 p-4 overflow-y-auto">
        <Card className="border-0 shadow-none">
          <CardContent className="p-0">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-500">CHEF</h3>
                <p className="text-base">{restaurant.chefName}</p>
              </div>
              
              <div>
                <h3 className="text-sm font-semibold text-gray-500">TOP CHEF SEASON</h3>
                <p className="text-base">Season {restaurant.season}</p>
              </div>
              
              <div>
                <h3 className="text-sm font-semibold text-gray-500">LOCATION</h3>
                <p className="text-base">{restaurant.city}, {selectedCountry}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Lat: {Number(restaurant.lat).toFixed(4)}, Lng: {Number(restaurant.lng).toFixed(4)}
                </p>
              </div>
              
              <Button 
                className="w-full bg-primary hover:bg-primary/90 text-white"
                onClick={handleGetDirections}
              >
                Get Directions
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RestaurantInfoPanel;
