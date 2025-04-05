import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info, RotateCcw } from "lucide-react";

interface HeaderProps {
  countries: string[];
  selectedCountry: string;
  onCountryChange: (country: string) => void;
  onUpdateData: () => void;
  lastUpdated: string;
}

const Header = ({ 
  countries, 
  selectedCountry, 
  onCountryChange, 
  onUpdateData, 
  lastUpdated 
}: HeaderProps) => {
  return (
    <header className="relative z-10 bg-white border-b border-gray-200 shadow-sm">
      <div className="px-4 py-3">
        <div className="flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold truncate">Top Chef Restaurant Map</h1>
            <Button 
              variant="ghost" 
              size="icon"
              className="rounded-full" 
              onClick={() => alert("This app shows restaurants owned or operated by Top Chef contestants worldwide.")}
              aria-label="Information"
            >
              <Info className="h-5 w-5" />
            </Button>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <label htmlFor="country-select" className="text-sm font-medium text-gray-700">Country:</label>
              <Select value={selectedCountry} onValueChange={onCountryChange}>
                <SelectTrigger className="w-32" id="country-select">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {countries.map(country => (
                    <SelectItem key={country} value={country}>
                      {country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <Button 
              variant="outline" 
              size="sm"
              className="flex items-center gap-2"
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
