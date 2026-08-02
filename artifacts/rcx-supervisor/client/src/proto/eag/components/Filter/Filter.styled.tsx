import { MultiSelect } from '@ringcx/ui';
import styled from 'styled-components';

// Fill the wrapper set by SupervisorFilter — the page fixes each filter's
// width there so all six fit in one viewport row; long chip/placeholder text
// truncates inside. Toggles keep the vendor's white fill; the gray #f9f9f9
// belongs to the filter *section* background (set on the toolbar row in
// SupervisorAgents), not to the filter boxes themselves.
export const StyledMultiSelect = styled(MultiSelect)`
    width: 100%;
    max-width: 100%;
    min-width: 0;
    z-index: 30;
`;
