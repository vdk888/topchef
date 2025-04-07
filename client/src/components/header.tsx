import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info, RotateCcw } from "lucide-react";
import { Season } from "@shared/schema"; // Import Season type

interface HeaderProps {
  countries: string[];
  selectedCountry: string;
  onCountryChange: (country: string) => void;
  onUpdateData: () => void;
  lastUpdated: string;
  // Add props for season filtering
  availableSeasons: Season[];
  selectedSeasonId: number | null;
  onSeasonChange: (seasonId: number | null) => void; 
}

const Header = ({ 
  countries, 
  selectedCountry, 
  onCountryChange, 
  onUpdateData, 
  lastUpdated,
  // Destructure new props
  availableSeasons,
  selectedSeasonId,
  onSeasonChange
}: HeaderProps) => {

  // Handler for season select change
  const handleSeasonSelect = (value: string) => {
    // Convert value back to number or null
    const seasonId = value === "all" ? null : parseInt(value, 10);
    onSeasonChange(seasonId);
  };
  
  return (
    <header className="relative z-40 bg-white border-b border-gray-200 shadow-sm">
      <div className="px-3 py-2">
        <div className="flex flex-col space-y-2">
          {/* App Title - Hide on Mobile */}
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold truncate sm:text-xl hidden sm:block">Top Chef Restaurant Map</h1>
            <Button 
              variant="ghost" 
              size="icon"
              className="rounded-full sm:ml-auto" 
              onClick={() => alert("This app shows restaurants owned or operated by Top Chef contestants worldwide.")}
              aria-label="Information"
            >
              <Info className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </div>
          
          {/* Mobile-optimized Filters */}
          <div className="flex flex-col space-y-2 w-full"> 
            {/* Country Row */}
            <div className="flex items-center gap-2"> 
              <label htmlFor="country-select" className="text-sm font-medium text-gray-700 w-20">Country:</label>
              <Select value={selectedCountry} onValueChange={onCountryChange}>
                <SelectTrigger className="flex-1 min-w-0" id="country-select">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent className="z-[100]"> {/* Ensure high z-index */}
                {/* Priority for France */}
                {countries.includes("France") && (
                  <SelectItem key="France" value="France">
                    France
                  </SelectItem>
                )}
                {/* Then display other countries alphabetically */}
                {countries
                  .filter(country => country !== "France")
                  .sort()
                  .map(country => (
                    <SelectItem key={country} value={country}>
                      {country}
                    </SelectItem>
                  ))
                }
                </SelectContent>
              </Select>
            </div>

            {/* Season Row */}
            <div className="flex items-center gap-2">
              <label htmlFor="season-select" className="text-sm font-medium text-gray-700 w-20">Season:</label>
              <Select 
                value={selectedSeasonId === null ? "all" : selectedSeasonId.toString()} 
                onValueChange={handleSeasonSelect}
                disabled={availableSeasons.length === 0}
              >
                <SelectTrigger className="flex-1 min-w-0" id="season-select">
                  <SelectValue placeholder="Select season" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  <SelectItem value="all">All Seasons</SelectItem>
                  {availableSeasons.map(season => (
                    <SelectItem key={season.id} value={season.id.toString()}>
                      Season {season.number} ({season.year})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Update Button */}
            <Button 
              variant="outline" 
              size="sm"
              className="flex items-center justify-center gap-2 w-full sm:w-auto"
              onClick={onUpdateData}
            >
              <RotateCcw className="h-4 w-4" />
              <span>Update Data</span>
            </Button>
          </div>
          
          <div className="text-xs text-gray-500">
            Last updated: {lastUpdated}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
