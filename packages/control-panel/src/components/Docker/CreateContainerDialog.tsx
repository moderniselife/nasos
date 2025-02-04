import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  ExpandMore as ExpandMoreIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiUrl } from '../../App';
import { ImageSearchDialog } from './ImageSearchDialog';

interface Port {
  container: number;
  host: number;
  protocol: 'tcp' | 'udp';
}

interface Volume {
  container: string;
  host: string;
  mode: 'rw' | 'ro';
}

interface EnvVar {
  key: string;
  value: string;
}

interface Device {
  host: string;
  container: string;
  permissions: string;
}

interface CreateContainerDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateContainerDialog({ open, onClose }: CreateContainerDialogProps): JSX.Element {
  const queryClient = useQueryClient();
  const [imageSearchOpen, setImageSearchOpen] = useState(false);
  const [image, setImage] = useState('');
  const [name, setName] = useState('');
  const [ports, setPorts] = useState<Port[]>([]);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [restart, setRestart] = useState('no');
  const [privileged, setPrivileged] = useState(false);
  const [networkMode, setNetworkMode] = useState('bridge');
  const [hostname, setHostname] = useState('');
  const [devices, setDevices] = useState<Device[]>([]);
  const [command, setCommand] = useState<string[]>([]);
  const [memory, setMemory] = useState<number | ''>('');
  const [cpuShares, setCpuShares] = useState<number | ''>('');
  const [labels, setLabels] = useState<EnvVar[]>([]);

  const createContainer = useMutation({
    mutationFn: async (data: any) => {
      // First, pull the image
      const pullResponse = await fetch(`${apiUrl}/api/docker/images/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: data.image }),
      });
      if (!pullResponse.ok) {
        throw new Error('Failed to pull image');
      }

      // Then create the container
      const response = await fetch(`${apiUrl}/api/docker/containers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error('Failed to create container');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docker-containers'] });
      onClose();
      resetForm();
    },
  });

  const resetForm = () => {
    setImage('');
    setName('');
    setPorts([]);
    setVolumes([]);
    setEnvVars([]);
    setRestart('no');
    setPrivileged(false);
    setNetworkMode('bridge');
    setHostname('');
    setDevices([]);
    setCommand([]);
    setMemory('');
    setCpuShares('');
    setLabels([]);
  };

  const handleSubmit = () => {
    const data = {
      image,
      name,
      ports: ports.map((p) => ({
        container: p.container,
        host: p.host,
        protocol: p.protocol,
      })),
      volumes: volumes.map((v) => ({
        container: v.container,
        host: v.host,
        mode: v.mode,
      })),
      env: Object.fromEntries(envVars.map((e) => [e.key, e.value])),
      restart,
      privileged,
      network_mode: networkMode,
      hostname: hostname || undefined,
      devices: devices.length > 0 ? devices : undefined,
      command: command.length > 0 ? command : undefined,
      memory: memory || undefined,
      cpu_shares: cpuShares || undefined,
      labels:
        labels.length > 0 ? Object.fromEntries(labels.map((l) => [l.key, l.value])) : undefined,
    };

    createContainer.mutate(data);
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>Create Container</DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            {/* Basic Settings */}
            <Grid item xs={12}>
              <Grid container spacing={1} alignItems="center">
                <Grid item xs>
                  <TextField
                    fullWidth
                    label="Image"
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                    margin="normal"
                  />
                </Grid>
                <Grid item>
                  <IconButton onClick={() => setImageSearchOpen(true)}>
                    <SearchIcon />
                  </IconButton>
                </Grid>
              </Grid>
              <TextField
                fullWidth
                label="Container Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                margin="normal"
              />
            </Grid>

            {/* Ports */}
            <Grid item xs={12}>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Ports</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  {ports.map((port, index) => (
                    <Grid container spacing={2} key={index} alignItems="center">
                      <Grid item xs={3}>
                        <TextField
                          fullWidth
                          label="Host Port"
                          type="number"
                          value={port.host}
                          onChange={(e) => {
                            const newPorts = [...ports];
                            newPorts[index].host = parseInt(e.target.value);
                            setPorts(newPorts);
                          }}
                        />
                      </Grid>
                      <Grid item xs={3}>
                        <TextField
                          fullWidth
                          label="Container Port"
                          type="number"
                          value={port.container}
                          onChange={(e) => {
                            const newPorts = [...ports];
                            newPorts[index].container = parseInt(e.target.value);
                            setPorts(newPorts);
                          }}
                        />
                      </Grid>
                      <Grid item xs={3}>
                        <FormControl fullWidth>
                          <InputLabel>Protocol</InputLabel>
                          <Select
                            value={port.protocol}
                            onChange={(e) => {
                              const newPorts = [...ports];
                              newPorts[index].protocol = e.target.value as 'tcp' | 'udp';
                              setPorts(newPorts);
                            }}
                          >
                            <MenuItem value="tcp">TCP</MenuItem>
                            <MenuItem value="udp">UDP</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={3}>
                        <IconButton onClick={() => setPorts(ports.filter((_, i) => i !== index))}>
                          <RemoveIcon />
                        </IconButton>
                      </Grid>
                    </Grid>
                  ))}
                  <Button
                    startIcon={<AddIcon />}
                    onClick={() => setPorts([...ports, { host: 0, container: 0, protocol: 'tcp' }])}
                  >
                    Add Port
                  </Button>
                </AccordionDetails>
              </Accordion>
            </Grid>

            {/* Volumes */}
            <Grid item xs={12}>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Volumes</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  {volumes.map((volume, index) => (
                    <Grid container spacing={2} key={index} alignItems="center">
                      <Grid item xs={4}>
                        <TextField
                          fullWidth
                          label="Host Path"
                          value={volume.host}
                          onChange={(e) => {
                            const newVolumes = [...volumes];
                            newVolumes[index].host = e.target.value;
                            setVolumes(newVolumes);
                          }}
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <TextField
                          fullWidth
                          label="Container Path"
                          value={volume.container}
                          onChange={(e) => {
                            const newVolumes = [...volumes];
                            newVolumes[index].container = e.target.value;
                            setVolumes(newVolumes);
                          }}
                        />
                      </Grid>
                      <Grid item xs={2}>
                        <FormControl fullWidth>
                          <InputLabel>Mode</InputLabel>
                          <Select
                            value={volume.mode}
                            onChange={(e) => {
                              const newVolumes = [...volumes];
                              newVolumes[index].mode = e.target.value as 'rw' | 'ro';
                              setVolumes(newVolumes);
                            }}
                          >
                            <MenuItem value="rw">RW</MenuItem>
                            <MenuItem value="ro">RO</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={2}>
                        <IconButton
                          onClick={() => setVolumes(volumes.filter((_, i) => i !== index))}
                        >
                          <RemoveIcon />
                        </IconButton>
                      </Grid>
                    </Grid>
                  ))}
                  <Button
                    startIcon={<AddIcon />}
                    onClick={() =>
                      setVolumes([...volumes, { host: '', container: '', mode: 'rw' }])
                    }
                  >
                    Add Volume
                  </Button>
                </AccordionDetails>
              </Accordion>
            </Grid>

            {/* Environment Variables */}
            <Grid item xs={12}>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Environment Variables</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  {envVars.map((env, index) => (
                    <Grid container spacing={2} key={index} alignItems="center">
                      <Grid item xs={5}>
                        <TextField
                          fullWidth
                          label="Key"
                          value={env.key}
                          onChange={(e) => {
                            const newEnvVars = [...envVars];
                            newEnvVars[index].key = e.target.value;
                            setEnvVars(newEnvVars);
                          }}
                        />
                      </Grid>
                      <Grid item xs={5}>
                        <TextField
                          fullWidth
                          label="Value"
                          value={env.value}
                          onChange={(e) => {
                            const newEnvVars = [...envVars];
                            newEnvVars[index].value = e.target.value;
                            setEnvVars(newEnvVars);
                          }}
                        />
                      </Grid>
                      <Grid item xs={2}>
                        <IconButton
                          onClick={() => setEnvVars(envVars.filter((_, i) => i !== index))}
                        >
                          <RemoveIcon />
                        </IconButton>
                      </Grid>
                    </Grid>
                  ))}
                  <Button
                    startIcon={<AddIcon />}
                    onClick={() => setEnvVars([...envVars, { key: '', value: '' }])}
                  >
                    Add Environment Variable
                  </Button>
                </AccordionDetails>
              </Accordion>
            </Grid>

            {/* Advanced Settings */}
            <Grid item xs={12}>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Advanced Settings</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <FormControl fullWidth>
                        <InputLabel>Restart Policy</InputLabel>
                        <Select value={restart} onChange={(e) => setRestart(e.target.value)}>
                          <MenuItem value="no">No</MenuItem>
                          <MenuItem value="always">Always</MenuItem>
                          <MenuItem value="on-failure">On Failure</MenuItem>
                          <MenuItem value="unless-stopped">Unless Stopped</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={6}>
                      <FormControl fullWidth>
                        <InputLabel>Network Mode</InputLabel>
                        <Select
                          value={networkMode}
                          onChange={(e) => setNetworkMode(e.target.value)}
                        >
                          <MenuItem value="bridge">Bridge</MenuItem>
                          <MenuItem value="host">Host</MenuItem>
                          <MenuItem value="none">None</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={privileged}
                            onChange={(e) => setPrivileged(e.target.checked)}
                          />
                        }
                        label="Privileged Mode"
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        label="Memory Limit (bytes)"
                        type="number"
                        value={memory}
                        onChange={(e) => setMemory(parseInt(e.target.value) || '')}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        label="CPU Shares"
                        type="number"
                        value={cpuShares}
                        onChange={(e) => setCpuShares(parseInt(e.target.value) || '')}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Hostname"
                        value={hostname}
                        onChange={(e) => setHostname(e.target.value)}
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>

            {/* Devices */}
            <Grid item xs={12}>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Devices</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  {devices.map((device, index) => (
                    <Grid container spacing={2} key={index} alignItems="center">
                      <Grid item xs={4}>
                        <TextField
                          fullWidth
                          label="Host Path"
                          value={device.host}
                          onChange={(e) => {
                            const newDevices = [...devices];
                            newDevices[index].host = e.target.value;
                            setDevices(newDevices);
                          }}
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <TextField
                          fullWidth
                          label="Container Path"
                          value={device.container}
                          onChange={(e) => {
                            const newDevices = [...devices];
                            newDevices[index].container = e.target.value;
                            setDevices(newDevices);
                          }}
                        />
                      </Grid>
                      <Grid item xs={2}>
                        <TextField
                          fullWidth
                          label="Permissions"
                          value={device.permissions}
                          onChange={(e) => {
                            const newDevices = [...devices];
                            newDevices[index].permissions = e.target.value;
                            setDevices(newDevices);
                          }}
                        />
                      </Grid>
                      <Grid item xs={2}>
                        <IconButton
                          onClick={() => setDevices(devices.filter((_, i) => i !== index))}
                        >
                          <RemoveIcon />
                        </IconButton>
                      </Grid>
                    </Grid>
                  ))}
                  <Button
                    startIcon={<AddIcon />}
                    onClick={() =>
                      setDevices([...devices, { host: '', container: '', permissions: 'rwm' }])
                    }
                  >
                    Add Device
                  </Button>
                </AccordionDetails>
              </Accordion>
            </Grid>

            {/* Command */}
            <Grid item xs={12}>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Command</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Command (space-separated)"
                        value={command.join(' ')}
                        onChange={(e) => setCommand(e.target.value.split(' ').filter(Boolean))}
                        helperText="Example: npm start"
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>

            {/* Labels */}
            <Grid item xs={12}>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Labels</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  {labels.map((label, index) => (
                    <Grid container spacing={2} key={index} alignItems="center">
                      <Grid item xs={5}>
                        <TextField
                          fullWidth
                          label="Key"
                          value={label.key}
                          onChange={(e) => {
                            const newLabels = [...labels];
                            newLabels[index].key = e.target.value;
                            setLabels(newLabels);
                          }}
                        />
                      </Grid>
                      <Grid item xs={5}>
                        <TextField
                          fullWidth
                          label="Value"
                          value={label.value}
                          onChange={(e) => {
                            const newLabels = [...labels];
                            newLabels[index].value = e.target.value;
                            setLabels(newLabels);
                          }}
                        />
                      </Grid>
                      <Grid item xs={2}>
                        <IconButton onClick={() => setLabels(labels.filter((_, i) => i !== index))}>
                          <RemoveIcon />
                        </IconButton>
                      </Grid>
                    </Grid>
                  ))}
                  <Button
                    startIcon={<AddIcon />}
                    onClick={() => setLabels([...labels, { key: '', value: '' }])}
                  >
                    Add Label
                  </Button>
                </AccordionDetails>
              </Accordion>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" color="primary">
            Create Container
          </Button>
        </DialogActions>
      </Dialog>

      <ImageSearchDialog
        open={imageSearchOpen}
        onClose={() => setImageSearchOpen(false)}
        onImageSelect={(selectedImage) => {
          setImage(selectedImage);
          setImageSearchOpen(false);
        }}
      />
    </>
  );
}
